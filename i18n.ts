import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import messagesEs from './messages/es.json';
import messagesEn from './messages/en.json';

export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'es';

export default getRequestConfig(async () => {
  // Leer el idioma de las cookies, por defecto español. Sin try/catch: `cookies()` lanza a propósito
  // al prerenderizar para que Next marque la ruta como dinámica.
  const cookieStore = await cookies();
  const locale: Locale = cookieStore.get('locale')?.value === 'en' ? 'en' : defaultLocale;

  const messages = locale === 'en' ? messagesEn : messagesEs;

  return {
    locale,
    messages
  };
});

