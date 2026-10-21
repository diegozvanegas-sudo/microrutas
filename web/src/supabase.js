// Cliente de Supabase con la URL y la llave pública de .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
import { createClient } from '@supabase/supabase-js';

var url = import.meta.env.VITE_SUPABASE_URL;
var llave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export var configurado = !!(url && llave);
// La sesión queda guardada en el celular: no hay que volver a ingresar cada vez, y sirve sin conexión.
export var supabase = configurado ? createClient(url, llave, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
