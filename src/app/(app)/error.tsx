"use client";

import { ErrorScreen } from "@/components/errors/ErrorScreen";

// Fallo dentro de una sección de la app: se muestra en el lugar del contenido,
// así que la barra lateral y la de abajo siguen disponibles para salir de ahí.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      code="500"
      title="No pudimos cargar esta sección"
      detail="Algo falló de nuestro lado al mostrarla. Puedes intentarlo de nuevo o seguir por otra parte de la app."
      digest={error.digest}
      error={error}
      onRetry={unstable_retry}
      fullscreen={false}
    />
  );
}
