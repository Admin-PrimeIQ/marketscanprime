import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // lib/db/connection.ts lee la raíz TLS de Railway desde disco si falta DATABASE_CA_APP;
  // el trazado de archivos no la ve (ruta dinámica), así que se incluye a mano en cada función.
  outputFileTracingIncludes: {
    '/**/*': ['./etl/certs/dbo-stage-ca.pem'],
  },
}

export default withNextIntl(nextConfig);
