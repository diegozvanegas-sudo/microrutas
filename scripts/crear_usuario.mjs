// Crea (o actualiza la contraseña de) un usuario que puede entrar a subsanaciones.
// Uso: npm run usuario -- correo@ejemplo.com "contraseña"
// Necesita en .env: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (Project Settings > API > service_role).
// La service_role salta todas las reglas de seguridad: nunca la ponga en la página web.
import 'dotenv/config';

const [correo, clave] = process.argv.slice(2);
const url = process.env.SUPABASE_URL, llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!correo || !clave) throw new Error('Uso: npm run usuario -- correo@ejemplo.com "contraseña"');
if (!url || !llave) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env');

const pedir = async (ruta, metodo, cuerpo) => {
  const r = await fetch(`${url}/auth/v1/admin/${ruta}`, {
    method: metodo,
    headers: { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
    body: cuerpo && JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.msg || datos.message || datos.error_description || `HTTP ${r.status}`);
  return datos;
};

const { users } = await pedir(`users?per_page=1000`, 'GET');
const existe = users.find((u) => u.email === correo.toLowerCase());
if (existe) {
  await pedir(`users/${existe.id}`, 'PUT', { password: clave });
  console.log(`Contraseña actualizada: ${correo}`);
} else {
  await pedir('users', 'POST', { email: correo, password: clave, email_confirm: true });
  console.log(`Usuario creado: ${correo}`);
}
