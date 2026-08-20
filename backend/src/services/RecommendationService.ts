// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
/** 
 * Interface de Serviço de Recomendação
 * 
 * Preparada para futura integração com IA (Ollama).
 * A implementação concreta virá em versão futura.
 */

export interface IRecommendation {
  mediaId: string;
  title: string;
  poster?: string;
  year: number;
  score: number;
  reason: string;
}

export interface IRecommendationService {
  getRecommendations(userId: string, limit?: number): Promise<IRecommendation[]>;
  getSimilar(mediaId: string, mediaType: 'movie' | 'series'): Promise<IRecommendation[]>;
  getPersonalized(userId: string): Promise<IRecommendation[]>;
}

/**
 * Implementação vazia — placeholder para integração futura com Ollama.
 * Quando a IA estiver disponível, esta classe será substituída por
 * uma implementação que chama o modelo local via API.
 */
export class RecommendationService implements IRecommendationService {
  async getRecommendations(_userId: string, _limit = 10): Promise<IRecommendation[]> {
    return [];
  }

  async getSimilar(_mediaId: string, _mediaType: 'movie' | 'series'): Promise<IRecommendation[]> {
    return [];
  }

  async getPersonalized(_userId: string): Promise<IRecommendation[]> {
    return [];
  }
}

export const recommendationService = new RecommendationService();
