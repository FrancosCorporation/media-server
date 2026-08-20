// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useEffect, useRef, useState, useCallback } from 'react';

interface ScrollAnimationOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  onEnter?: () => void;
  onExit?: () => void;
}

export function useScrollAnimation(options: ScrollAnimationOptions = {}) {
  const {
    threshold = 0.1,
    rootMargin = '0px 0px -50px 0px',
    triggerOnce = true,
    onEnter,
    onExit,
  } = options;

  const [isVisible, setIsVisible] = useState(() => triggerOnce ? false : false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        setIsVisible(visible);
        
        if (visible) {
          if (triggerOnce) setHasTriggered(true);
          onEnter?.();
        } else {
          onExit?.();
          if (!triggerOnce) setHasTriggered(false);
        }
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [threshold, rootMargin, triggerOnce, onEnter, onExit]);

  // If triggerOnce and already triggered, ensure visible
  if (triggerOnce && hasTriggered && !isVisible) {
    // Schedule for next tick to avoid effect-setState warning
    setTimeout(() => setIsVisible(true), 0);
  }

  return { ref: setRef, isVisible, hasTriggered };
}

// Hook para animações em cascata (stagger)
export function useStaggeredAnimation(itemCount: number, baseDelay = 100) {
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLElement | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || triggeredRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          triggeredRef.current = true;
          for (let i = 0; i < itemCount; i++) {
            setTimeout(() => {
              setVisibleItems(prev => new Set(prev).add(i));
            }, i * baseDelay);
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [itemCount, baseDelay]);

  const setRef = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
  }, []);

  return { ref: setRef, visibleItems };
}

// Hook para parallax suave
export function useParallax(speed = 0.3) {
  const [offset, setOffset] = useState(0);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleScroll = () => {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      if (rect.bottom >= 0 && rect.top <= viewportHeight) {
        const scrolled = -rect.top * speed;
        setOffset(scrolled);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed]);

  const setRef = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
  }, []);

  return { ref: setRef, offset, style: { transform: `translateY(${offset}px)` } };
}

// Hook para contador animado
export function useAnimatedCounter(end: number, duration = 2000, startOnVisible = true) {
  const [count, setCount] = useState(0);
  const { ref, isVisible } = useScrollAnimation({ triggerOnce: true });
  const animatedRef = useRef(false);

  useEffect(() => {
    if (startOnVisible && isVisible && !animatedRef.current) {
      animatedRef.current = true;
      const startTime = performance.now();
      const startValue = 0;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = Math.floor(startValue + (end - startValue) * eased);
        setCount(current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [isVisible, end, duration, startOnVisible]);

  return { ref, count: count.toLocaleString('pt-BR') };
}