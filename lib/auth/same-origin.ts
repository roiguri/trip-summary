// State-changing auth requests must come from this site's own pages (a cross-site form can't post a
// session in or out).
export const sameOrigin = (req: Request) => req.headers.get('origin') === new URL(req.url).origin;
