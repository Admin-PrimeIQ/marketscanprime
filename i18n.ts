import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import messagesEs from './messages/es.json';
import messagesEn from './messages/en.json';

export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'es';

export default getRequestConfig(async () => {
  // Leer el idioma de las cookies, por defecto español
  let locale: Locale = defaultLocale;
  
  try {
    const cookieStore = await cookies();
    locale = (cookieStore.get('locale')?.value || defaultLocale) as Locale;
  } catch (error) {
    // Si hay error, usar valor por defecto
    locale = defaultLocale;
  }

  // Usar mensajes estáticos según el locale
  const messages = locale === 'es' ? messagesEs : messagesEn;

  return {
    locale,
    messages
  };
});

