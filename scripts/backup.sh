#!/usr/bin/env bash
# Copia de la base de Supabase cifrada con AES-256. Se corre a mano (con Docker abierto):
#   DATABASE_URL=... BACKUP_CLAVE=... bash scripts/backup.sh <carpeta>
# Deja <carpeta>/microrutas_<fecha UTC>.dump.gpg. Nada sin cifrar queda en <carpeta>: la copia se revisa y se cifra en una temporal.
# Abrir una copia:  gpg --decrypt --output copia.dump microrutas_<fecha>.dump.gpg
# Restaurar:        pg_restore --no-owner --no-privileges --dbname=<base vacía> copia.dump
set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL}"
: "${BACKUP_CLAVE:?Falta BACKUP_CLAVE}"
SALIDA="${1:?Falta la carpeta de salida}"
mkdir -p "$SALIDA"
NOMBRE="microrutas_$(date -u +%Y-%m-%d_%H%M).dump"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
IMAGEN=postgres:17 # misma versión mayor que el servidor de Supabase (17)

# public: datos de la app; auth: usuarios y sus contraseñas cifradas; rutina y supabase_migrations: tareas y migraciones aplicadas
docker run --rm -e DATABASE_URL -v "$TMP:/copia" "$IMAGEN" sh -c \
  "pg_dump \"\$DATABASE_URL\" --format=custom --no-owner --no-privileges --schema=public --schema=auth --schema=rutina --schema=supabase_migrations --file=/copia/$NOMBRE"

# La copia debe poder leerse y traer las tablas de la app; si no, falla y GitHub avisa por correo
LISTA="$(docker run --rm -v "$TMP:/copia" "$IMAGEN" pg_restore --list "/copia/$NOMBRE")"
for t in visitas pqrs perfiles; do
  grep -q "TABLE DATA public $t " <<<"$LISTA" || { echo "La copia no trae la tabla public.$t" >&2; exit 1; }
done
grep -q "TABLE DATA auth users " <<<"$LISTA" || { echo "La copia no trae auth.users" >&2; exit 1; }

printf '%s' "$BACKUP_CLAVE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --output "$TMP/$NOMBRE.gpg" "$TMP/$NOMBRE"
# Se comprueba que se abre con la clave antes de darla por buena
printf '%s' "$BACKUP_CLAVE" | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 --decrypt "$TMP/$NOMBRE.gpg" | cmp - "$TMP/$NOMBRE"

mv "$TMP/$NOMBRE.gpg" "$SALIDA/"
echo "Copia lista: $NOMBRE.gpg ($(du -h "$SALIDA/$NOMBRE.gpg" | cut -f1))"
