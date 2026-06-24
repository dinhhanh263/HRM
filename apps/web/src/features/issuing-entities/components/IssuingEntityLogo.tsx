import { useEffect, useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchIssuingEntityLogoUrl } from '../hooks/useIssuingEntities';

interface IssuingEntityLogoProps {
  entityId: string;
  // Bump this (e.g. updatedAt) to force a re-fetch after upload/remove.
  cacheKey?: string;
  hasLogo: boolean;
  alt: string;
  className?: string;
}

/**
 * Auth-aware logo thumbnail. The GET /logo endpoint needs the bearer token, so
 * we fetch it as a blob through the api-client and render an object URL instead
 * of pointing <img> at the API path directly.
 */
export function IssuingEntityLogo({
  entityId,
  cacheKey,
  hasLogo,
  alt,
  className,
}: IssuingEntityLogoProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasLogo) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    setLoading(true);
    fetchIssuingEntityLogoUrl(entityId)
      .then((next) => {
        if (revoked) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => setUrl(null))
      .finally(() => {
        if (!revoked) setLoading(false);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entityId, hasLogo, cacheKey]);

  const base = cn(
    'flex items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-alt shrink-0',
    className,
  );

  if (loading) {
    return (
      <div className={base} aria-busy="true">
        <Loader2 className="size-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!hasLogo || !url) {
    return (
      <div className={base} role="img" aria-label={alt}>
        <Building2 className="size-4 text-text-muted" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={base}>
      <img src={url} alt={alt} className="h-full w-full object-contain" />
    </div>
  );
}
