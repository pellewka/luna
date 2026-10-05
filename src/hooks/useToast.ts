import { useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState('');
  const [action, setAction] = useState<{ label: string; onPress: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function notify(message: string, nextAction?: { label: string; onPress: () => void }) {
    setToast(message);
    setAction(nextAction || null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setToast('');
        setAction(null);
      },
      nextAction ? 6000 : 3000,
    );
  }

  return { toast, action, notify };
}
