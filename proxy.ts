import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { resolveDataBackend } from './lib/api/data-backend';

const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password'];

export function proxy(request: NextRequest) {
  // Backend `strapi`: sin cambios, el layout del cliente decide (la sesión vive en localStorage).
  if (resolveDataBackend(process.env.NEXT_PUBLIC_DATA_BACKEND) !== 'prisma') return NextResponse.next();

  // Backend `prisma`: sin cookie de sesión no se navega. Solo mira que exista; la validación real
  // (firma, vencimiento, usuario bloqueado, rol) la hace cada Server Action con `requireUser`.
  if (PUBLIC_PATHS.includes(request.nextUrl.pathname) || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  // Excluir archivos estáticos, API routes, y archivos del sistema
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*|favicon.ico|robots.txt|sitemap.xml).*)'
  ]
};
