import { MetadataRoute } from 'next';
import { DEFAULT_PUBLIC_HOST } from '@/lib/verify/public-verify-url';

type ChangeFrequency = MetadataRoute.Sitemap[number]['changeFrequency'];

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: ChangeFrequency }> = [
    // `/` is the landing page again (operator 2026-10-06), the front of the public site.
    { path: '/', priority: 1.0, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/verify', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/terms-of-service', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/privacy-policy', priority: 0.7, changeFrequency: 'yearly' },
    // The one sign-in door. The password pages behind it (/auth/*/login, /register) are
    // temporary and removed at launch, so they are not advertised to crawlers.
    { path: '/auth', priority: 0.6, changeFrequency: 'monthly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();

    return STATIC_ROUTES.map((route) => ({
        url: `${DEFAULT_PUBLIC_HOST}${route.path}`,
        lastModified,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
    }));
}
