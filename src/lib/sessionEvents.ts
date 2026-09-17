// Evento del navegador usado para avisar que la lista de sesiones cambió sin
// pasar por Convex (p. ej. al revocar otras sesiones desde `PasswordCard`).
// `SessionsCard` tiene su propio estado local y no hay capa de estado global,
// así que ambos componentes citan esta misma constante para no duplicar el
// nombre del evento.
export const SESSIONS_CHANGED_EVENT = "okani:sessions-changed";
