// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Calendar, Save, ArrowLeft, Camera, Trash2, Phone, Smartphone, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import ImageCropper from '../components/ImageCropper';
import AgentSettings from '../components/AgentSettings';
import { apiFetch } from '../lib/api';

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ name: string; email: string; createdAt: string; photo?: string; phone?: string; phoneVerified?: boolean } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refresh key para forçar recarga de dados
  const [refreshKey, setRefreshKey] = useState(0);

  // Phone verification state
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeTimer, setCodeTimer] = useState(0);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = localStorage.getItem('accessToken');

  /**
   * useEffect que carrega dados do usuário.
   * Roda na montagem e sempre que refreshKey é incrementado
   * (após salvar perfil, trocar/remover foto, verificar telefone).
   * 
   * Isso garante que os dados SEMPRE estejam atualizados
   * quando o usuário volta para a página de configurações.
   */
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const res = await apiFetch('/auth/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setName(data.user.name || '');
          setPhoto(data.user.photo ? `${data.user.photo}?t=${Date.now()}` : null);
          setPhone(data.user.phone || '');
          return; // Sai se deu certo
        }
      } catch {
        // Se apiFetch jogou 401, já redirecionou para login
      }
      
      // Se chegou aqui, a API falhou — tenta dados do localStorage como fallback
      const cachedUser = localStorage.getItem('user');
      if (cachedUser) {
        try {
          const parsed = JSON.parse(cachedUser);
          setUser(parsed);
          setName(parsed.name || '');
          setPhoto(parsed.photo ? `${parsed.photo}?t=${Date.now()}` : null);
          setPhone(parsed.phone || '');
          return;
        } catch {
          // JSON inválido
        }
      }

      // Último recurso: cria um user mínimo para não travar a UI
      setUser({
        name: 'Usuário',
        email: '',
        createdAt: new Date().toISOString(),
      });
    };

    fetchData();
  }, [token, refreshKey]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const handleSave = async () => {
    if (!token || !name.trim()) return;

    setSaving(true);
    setMessage('');

    try {
      const res = await apiFetch('/auth/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          name: name.trim(),
          phone: phone.replace(/\s/g, '') || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setUser((prev) => prev ? { ...prev, name: data.user.name, phone: data.user.phone, phoneVerified: data.user.phoneVerified } : prev);
        showMessage('Perfil atualizado com sucesso!', 'success');
        setRefreshKey((k) => k + 1); // 👈 Força recarga dos dados
      } else {
        const err = await res.json();
        showMessage(err.error?.message || 'Erro ao atualizar perfil.', 'error');
      }
    } catch {
      showMessage('Erro ao conectar com o servidor.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Photo Upload com Crop ─────────────────────────────────
  // 1. Usuário seleciona o arquivo → lê como data URL
  // 2. Abre o ImageCropper para ajustar corte/zoom
  // 3. ImageCropper comprime para 400x400 WebP no frontend
  // 4. Faz upload do blob comprimido (agora com ~50-200KB)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Valida tipo
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showMessage('Formato inválido. Use JPEG, PNG ou WebP.', 'error');
      return;
    }

    // Limite aumentado para 20MB antes da compressão
    if (file.size > 20 * 1024 * 1024) {
      showMessage('Imagem muito grande. Máximo 20MB.', 'error');
      return;
    }

    // Lê o arquivo como data URL e abre o cropper
    const reader = new FileReader();
    reader.onloadend = () => {
      setCropperImage(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Reseta o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    if (!token) {
      return;
    }

    // ── 1. Preview IMEDIATO com flushSync ──────────────────
    const previousPhoto = photo;

    const previewUrl = URL.createObjectURL(blob);

    flushSync(() => {
      setPhoto(previewUrl);
      setUser((prev) => prev ? { ...prev, photo: previewUrl } : prev);
    });

    // ── 2. Fecha o modal e mostra loading ─────────────────
    setCropperImage(null);
    setSavingPhoto(true);

    try {
      // ── 3. Converte o blob para base64 e envia ao backend ─
      const reader = new FileReader();
      reader.readAsDataURL(blob);

      const base64Photo = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = () => {
          reject(new Error('Erro ao ler imagem'));
        };
      });

      const res = await apiFetch('/auth/settings/photo', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photo: base64Photo }),
      });

      // ── 4. Se o servidor salvou, substitui preview pela URL real ─
      if (res.ok) {
        const data = await res.json();
        const cacheBuster = `?t=${Date.now()}`;
        const photoUrl = data.user.photo ? `${data.user.photo}${cacheBuster}` : null;

        URL.revokeObjectURL(previewUrl);
        setPhoto(photoUrl);
        setUser((prev) => prev ? { ...prev, photo: photoUrl ?? undefined } : prev);
        showMessage('Foto atualizada com sucesso!', 'success');
      } else {
        // ── 5. Se falhou, reverte o preview para a foto anterior ─
        URL.revokeObjectURL(previewUrl);
        setPhoto(previousPhoto);
        setUser((prev) => prev ? { ...prev, photo: previousPhoto ?? undefined } : prev);
        const err = await res.json();
        showMessage(err.error?.message || 'Erro ao salvar foto.', 'error');
      }
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setPhoto(previousPhoto);
      setUser((prev) => prev ? { ...prev, photo: previousPhoto ?? undefined } : prev);
      showMessage('Erro ao enviar foto.', 'error');
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleCropCancel = () => {
    setCropperImage(null);
  };

  const handleRemovePhoto = async () => {
    if (!token) return;

    setSavingPhoto(true);
    try {
      const res = await apiFetch('/auth/settings/photo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setPhoto(null);
        setUser((prev) => prev ? { ...prev, photo: undefined } : prev);
        // Também limpa do localStorage para o Dashboard refletir
        try {
          const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
          delete cachedUser.photo;
          localStorage.setItem('user', JSON.stringify(cachedUser));
        } catch {}
        showMessage('Foto removida.', 'success');
        setRefreshKey((k) => k + 1); // Força recarga dos dados do backend
      } else {
        // !res.ok e não é 401 (apiFetch já tratou 401)
        const err = await res.json().catch(() => ({ error: { message: 'Erro ao remover foto.' } }));
        showMessage(err.error?.message || 'Erro ao remover foto.', 'error');
      }
    } catch {
      showMessage('Erro ao remover foto.', 'error');
    } finally {
      setSavingPhoto(false);
    }
  };

  // ─── WhatsApp Verification ────────────────────────────────

  const startCodeTimer = (seconds: number) => {
    setCodeTimer(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCodeTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    if (!token || !phone || phone.replace(/\D/g, '').length < 10) {
      showMessage('Adicione um número de telefone válido primeiro.', 'error');
      return;
    }

    setSendingCode(true);
    setCodeSent(false);

    try {
      const res = await apiFetch('/auth/phone/send-code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: phone.replace(/\s/g, '') }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setCodeSent(true);
        setShowCodeInput(true);
        startCodeTimer(600); // 10 minutos
        showMessage('Código enviado via WhatsApp!', 'success');
      } else {
        showMessage(data.message || 'Erro ao enviar código.', 'error');
      }
    } catch {
      showMessage('Erro ao conectar com o servidor.', 'error');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!token || !verificationCode || verificationCode.length !== 6) {
      showMessage('Digite o código de 6 dígitos.', 'error');
      return;
    }

    setVerifyingCode(true);

    try {
      const res = await apiFetch('/auth/phone/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: verificationCode }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setUser((prev) => prev ? { ...prev, phoneVerified: true } : prev);
        setShowCodeInput(false);
        setCodeSent(false);
        if (timerRef.current) clearInterval(timerRef.current);
        setCodeTimer(0);
        showMessage('Telefone verificado com sucesso! 🎉', 'success');
        setRefreshKey((k) => k + 1); // 👈 Força recarga dos dados
      } else {
        showMessage(data.error?.message || 'Código inválido ou expirado.', 'error');
      }
    } catch {
      showMessage('Erro ao verificar código.', 'error');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResendCode = () => {
    setVerificationCode('');
    handleSendCode();
  };

  // ─── Delete Account ──────────────────────────────────────────

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const DELETE_PHRASE = 'eu quero que delete minha conta';

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== DELETE_PHRASE) {
      setDeleteError('Digite exatamente a frase de confirmação.');
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await apiFetch('/auth/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });

      const data = await res.json();

      if (res.ok) {
        // Remove dados locais
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        // Redireciona para home
        navigate('/');
      } else {
        setDeleteError(data?.error?.message || 'Erro ao excluir conta.');
      }
    } catch {
      setDeleteError('Erro ao conectar com o servidor.');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-[#A1A1AA] text-sm">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-[#A1A1AA] hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>Voltar ao Dashboard</span>
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="relative group">
            {/* Avatar */}
            {photo ? (
              <img
                src={photo}
                alt={name}
                className="w-16 h-16 rounded-full object-cover border-2 border-white/10"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-2xl font-bold shadow-lg shadow-primary/20">
                {(name?.charAt(0)?.toUpperCase() || '?')}
              </div>
            )}

            {/* Hover overlay para trocar foto */}
            <div
              className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={20} className="text-white" />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{name || 'Configurações'}</h1>
            <p className="text-[#A1A1AA] text-sm">Gerencie suas informações pessoais</p>
          </div>

          {photo && (
            <button
              onClick={handleRemovePhoto}
              disabled={savingPhoto}
              className="p-2.5 rounded-xl hover:bg-red-500/10 text-[#A1A1AA] hover:text-red-400 transition-colors disabled:opacity-50"
              title="Remover foto"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Photo Upload Card */}
          <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl border border-white/5 p-8">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Camera size={20} className="text-primary-light" />
              Foto do Perfil
            </h3>

            <div className="flex items-center gap-6">
              {photo ? (
                <img
                  src={photo}
                  alt="Preview"
                  className="w-24 h-24 rounded-xl object-cover border-2 border-white/10 shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20">
                  <User size={40} className="text-white/60" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={savingPhoto}
                  className="px-5 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary-light text-sm font-medium transition-colors border border-primary/20 disabled:opacity-50"
                >
                  {savingPhoto ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                      Comprimindo...
                    </span>
                  ) : (
                    'Escolher foto'
                  )}
                </button>
                <p className="text-xs text-[#6B7280]">
                  JPEG, PNG ou WebP • Compressão automática para 400x400
                </p>
              </div>
            </div>
          </div>

          {/* Profile Info Card */}
          <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl border border-white/5 p-8 space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <User size={20} className="text-primary-light" />
              Informações Pessoais
            </h3>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all"
                placeholder="Seu nome"
              />
            </div>

            {/* Email (readonly) */}
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
                <Mail size={16} className="inline mr-2" />
                E-mail
              </label>
              <input
                type="email"
                value={user.email}
                readOnly
                className="w-full px-4 py-3 rounded-xl bg-[#0D1117]/50 border border-white/5 text-[#A1A1AA]/60 cursor-not-allowed outline-none"
              />
              <p className="text-xs text-[#6B7280] mt-1">O e-mail não pode ser alterado</p>
            </div>

            {/* Created at */}
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
                <Calendar size={16} className="inline mr-2" />
                Conta criada em
              </label>
              <p className="text-white px-4 py-3 rounded-xl bg-[#0D1117]/50 border border-white/5">
                {new Date(user.createdAt).toLocaleDateString('pt-BR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Delete Account Card */}
          <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl border border-red-500/10 p-8 space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-red-400">
              <AlertTriangle size={20} />
              Zona de Perigo
            </h3>
            <p className="text-sm text-[#A1A1AA]">
              Excluir sua conta é irreversível. Todos os seus dados, conversas e
              informações serão permanentemente removidos.
            </p>

            {!showDeleteConfirm ? (
              <button
                onClick={() => {
                  setShowDeleteConfirm(true);
                  setDeleteConfirmation('');
                  setDeleteError(null);
                }}
                className="px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-colors border border-red-500/20 flex items-center gap-2"
              >
                <Trash2 size={18} />
                Excluir minha conta
              </button>
            ) : (
              <div className="space-y-4 p-5 rounded-xl bg-red-500/5 border border-red-500/20">
                <p className="text-sm font-medium text-red-400">
                  Digite a frase abaixo para confirmar a exclusão permanente da sua conta:
                </p>
                <p className="text-sm text-white bg-[#0D1117] rounded-lg px-4 py-3 border border-white/5 font-mono select-all">
                  {DELETE_PHRASE}
                </p>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => {
                    setDeleteConfirmation(e.target.value.toLowerCase());
                    setDeleteError(null);
                  }}
                  placeholder="Digite a frase de confirmação"
                  className="w-full px-4 py-3 rounded-xl bg-[#0D1117] border border-red-500/30 text-white placeholder:text-[#6B7280]/50 focus:border-red-500 outline-none transition-all"
                  autoFocus
                />

                {deleteError && (
                  <p className="text-sm text-red-400 flex items-center gap-2" role="alert">
                    <AlertCircle size={14} />
                    {deleteError}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmation('');
                      setDeleteError(null);
                    }}
                    disabled={deleting}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[#A1A1AA] text-sm font-medium transition-colors border border-white/5 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting || deleteConfirmation !== DELETE_PHRASE}
                    className="flex-1 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Excluir permanentemente
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Agent Settings Card */}
          <AgentSettings />

          {/* Phone Verification Card */}
          <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl border border-white/5 p-8 space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Smartphone size={20} className="text-primary-light" />
              Verificação por WhatsApp
            </h3>
            <p className="text-sm text-[#A1A1AA]">
              Adicione seu número de WhatsApp para receber um código de verificação.
              Isso aumenta a segurança da sua conta.
            </p>

            {/* Phone Input */}
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
                <Phone size={16} className="inline mr-2" />
                WhatsApp
              </label>
              <div className="flex gap-3">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (user.phoneVerified && e.target.value !== user.phone) {
                      setUser((prev) => prev ? { ...prev, phoneVerified: false } : prev);
                    }
                  }}
                  placeholder="+5511999999999"
                  className="flex-1 px-4 py-3 rounded-xl bg-[#0D1117] border border-white/5 text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all font-mono"
                />
              </div>
              <p className="text-xs text-[#6B7280] mt-1">
                Formato internacional. Ex: +5511999999999
              </p>
            </div>

            {/* Status + Action */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#0D1117]/50 border border-white/5">
              <div className="flex items-center gap-3">
                {user.phoneVerified ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <ShieldCheck size={20} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-400">Telefone verificado</p>
                      <p className="text-xs text-[#6B7280]">{user.phone}</p>
                    </div>
                  </>
                ) : phone ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                      <XCircle size={20} className="text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-yellow-400">Não verificado</p>
                      <p className="text-xs text-[#6B7280]">Verifique seu número para ativar</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-[#1E293B] flex items-center justify-center">
                      <Smartphone size={20} className="text-[#A1A1AA]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#A1A1AA]">Nenhum telefone</p>
                      <p className="text-xs text-[#6B7280]">Adicione um número acima</p>
                    </div>
                  </>
                )}
              </div>

              {!user.phoneVerified && phone && (
                <button
                  onClick={handleSendCode}
                  disabled={sendingCode || !phone.replace(/\D/g, '').length}
                  className="px-5 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary-light text-sm font-medium transition-colors border border-primary/20 disabled:opacity-50"
                >
                  {sendingCode ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : (
                    'Verificar'
                  )}
                </button>
              )}
            </div>

            {/* Code Input */}
            {showCodeInput && (
              <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 space-y-4 animate-fade-in">
                <div>
                  <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
                    Código de verificação
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="flex-1 px-4 py-3 rounded-xl bg-[#0D1117] border border-primary/30 text-white placeholder:text-[#6B7280]/50 focus:border-primary outline-none transition-all text-center text-2xl font-bold tracking-[0.5em] font-mono"
                      autoFocus
                    />
                    <button
                      onClick={handleVerifyCode}
                      disabled={verifyingCode || verificationCode.length !== 6}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                    >
                      {verifyingCode ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <CheckCircle2 size={20} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  {codeTimer > 0 ? (
                    <span className="text-[#A1A1AA]">
                      Código expira em{' '}
                      <span className="text-primary-light font-mono font-medium">{formatTimer(codeTimer)}</span>
                    </span>
                  ) : (
                    <span className="text-red-400">Código expirado</span>
                  )}
                  <button
                    onClick={handleResendCode}
                    disabled={sendingCode}
                    className="text-primary-light hover:text-primary-light/80 transition-colors disabled:opacity-50 font-medium"
                  >
                    {sendingCode ? 'Enviando...' : 'Reenviar código'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Message */}
          {message && (
            <div
              className={`p-4 rounded-xl text-sm flex items-center gap-3 ${
                messageType === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
              role="alert"
            >
              {messageType === 'success' ? (
                <CheckCircle2 size={18} className="flex-shrink-0" />
              ) : (
                <XCircle size={18} className="flex-shrink-0" />
              )}
              {message}
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-medium transition-all disabled:opacity-50 shadow-lg shadow-primary/20 group"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save size={18} className="group-hover:scale-110 transition-transform" />
                Salvar alterações
              </>
            )}
          </button>
        </div>
      </div>

      {/* Image Cropper Modal */}
      {cropperImage && (
        <ImageCropper
          imageUrl={cropperImage}
          onCrop={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
