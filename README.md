# Royal Mexican Casino — Demo

Casino web completo en negro y dorado, **demo con fichas de prueba, sin dinero real**.
No hay depósitos, no hay retiros y no hay pagos de ningún tipo.

## Qué incluye

- **Registro e inicio de sesión** con número de teléfono (10 dígitos) y contraseña.
  Sin verificación por SMS. Las contraseñas se guardan con hash bcrypt, nunca en
  texto plano. **La primera cuenta registrada es la administradora.**
- **10 juegos originales** (nada con licencia, nada copiado):
  - 6 tragamonedas con arte ilustrado propio: **Águila Dorada** (la destacada:
    héroe águila dorada original, medidores de jackpot GRAND/MAYOR/MENOR/MINI,
    gemas detalladas en marcos dorados, fondo de templo al atardecer),
    Fiesta Dorada, Tesoros del Mar, Fuego Azteca, Frutas Neón y Safari Dorado.
    5 rodillos × 3 filas, 20 líneas, comodín, scatter con 10/15/20 giros
    gratis (premios ×2) y Respin Dorado (5+ monedas, monedas de 1×–25×,
    rejilla llena = tesoro 50×). RTP simulado (8,000 giros por tema):
    Águila Dorada 87.6%, Fiesta Dorada 87.5%, Tesoros del Mar 85.9%,
    Fuego Azteca 95.3%, Frutas Neón 79.3%, Safari Dorado 85.8%.
    Los medidores de jackpot son visuales (valores fijos de demo, no se pagan).
    Existe además un endpoint de Nudge (`POST /api/slot/nudge`, un empujón
    gratis de un rodillo tras un giro sin premio), implementado en el servidor
    pero todavía sin botón en la interfaz.
  - Ruleta Europea (0–36) con tablero tocable y animación de giro.
  - Blackjack (paga 3 a 2, Pedir / Plantarse / Doblar).
  - Bacará Punto Banco (Jugador 2×, Banca 1.95×, Empate 9×).
  - Video Póker Jacks or Better (Escalera Real 250×).
- **Apuestas de $1 a $1,000 MXN**, saldo inicial de $1,000 en fichas de prueba
  por jugador nuevo, historial de jugadas por jugador.
- **Escalera VIP de 16 niveles**: Bronce 1–3, Plata 1–3, Oro 1–3, Platino 1–3,
  Diamante 1–3 y REAL (nivel máximo). Cada nivel exige $10,000 jugados más que
  el anterior ($1,200,000 jugados en total para llegar a REAL). El total jugado
  **no** se reinicia cuando se restablece un saldo.
- **Panel de administración** (solo la cuenta administradora): lista de
  jugadores con saldos y niveles VIP, totales (jugadores y total jugado) y
  restablecer el saldo de cualquier jugador a $1,000. **Los jugadores NO
  pueden restablecer su propio saldo**: no existe botón de restablecer para
  ellos; solo el admin puede hacerlo.
- **Sección para invitar amigos** con el enlace público de la página (se lee
  de la variable de entorno `PUBLIC_URL`; si no está definida, usa el origen
  actual).

## Cómo correrlo en local

Requisitos: **Node.js 24 o superior** y una base **Postgres** (la app ya no
usa SQLite). Para probar en local, instala Postgres y crea una base, o usa
la base gratis de Supabase (ver abajo).

```bash
cd royal-mexican-casino
npm install
DATABASE_URL=postgres://usuario:contraseña@localhost:5432/casino npm start
```

Abre http://localhost:3000 — regístrate con tu teléfono (la primera cuenta es
la administradora) y juega. Las tablas se crean solas al arrancar.

Variables de entorno:

| Variable       | Para qué                                              | Por defecto            |
| -------------- | ----------------------------------------------------- | ---------------------- |
| `DATABASE_URL` | URL de la base Postgres (obligatoria)                 | —                      |
| `PORT`         | Puerto del servidor                                   | `3000`                 |
| `PUBLIC_URL`   | URL pública que se muestra en "Invita a tus amigos"   | origen actual          |

## Cómo desplegarlo en Render (plan gratis) con Postgres gratis (Supabase)

La app guarda todo en Postgres externo, así que **no necesita disco
persistente**: las instancias gratis de Render no admiten discos y su sistema
de archivos es efímero, pero eso ya no importa porque los datos viven en la
base. La base gratis de Supabase no expira (se pausa tras 1 semana sin
actividad y se reactiva sola al recibir tráfico; los datos se conservan).

1. Crea la base gratis en Supabase (https://supabase.com → New project,
   plan Free). En **Project Settings → Database → Connection string → URI**
   copia la URL (empieza con `postgresql://` y lleva `sslmode=require`).
   Si la contraseña tiene caracteres especiales, codifícalos en la URL
   (`%40` para `@`, etc.) o usa el "Connection pooling" (puerto 6543).
2. Sube este proyecto a un repositorio de GitHub.
3. En Render: **New → Web Service** → conecta el repositorio (o usa el
   `render.yaml` incluido con **New → Blueprint**).
4. Configuración:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. **Environment Variables** del servicio:
   - `DATABASE_URL=<la URL de Supabase>` (márcala como secreto)
   - `PUBLIC_URL=https://tu-servicio.onrender.com` (la URL que te dé Render;
     se puede poner después del primer despliegue)
   - `NODE_VERSION=24`
6. Despliega. La primera cuenta que se registre será la administradora.
   Los datos (cuentas, saldos, VIP, historial) viven en Supabase y
   sobreviven a reinicios y redespliegues.

## Notas

- Todo el arte (símbolos, rueda, mesa, dorso de cartas) es original, creado
  para este casino. No se usa arte ni marcas de ningún juego con licencia.
- Las fichas no tienen valor real y no se pueden retirar ni transferir.
- Los números de teléfono son datos personales: no los compartas ni los
  exportes fuera del panel de administración.
