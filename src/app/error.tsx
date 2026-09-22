"use client";

import { ErrorScreen } from "@/components/errors/ErrorScreen";

// Respaldo para lo que no cubre (app)/error.tsx: un fallo en el propio layout de
// la app (p. ej. al comprobar la sesión) o en las pantallas de acceso.
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      code="500"
      title="Algo salió mal"
      detail="No pudimos abrir esta pantalla. Suele resolverse al intentarlo de nuevo en unos segundos."
      digest={error.digest}
      error={error}
      onRetry={unstable_retry}
      reloadHome
    />
  );
}
