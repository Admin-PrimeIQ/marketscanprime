'use client'

import { useLocale as useNextIntlLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { useTransition } from 'react';

export function useLocale() {
  const locale = useNextIntlLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const setLocale = (newLocale: string) => {
    // Guardar en cookie
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    
    // Recargar la página para aplicar el nuevo idioma
    startTransition(() => {
      router.refresh();
    });
  };

  return {
    locale,
    setLocale,
    isPending
  };
}

