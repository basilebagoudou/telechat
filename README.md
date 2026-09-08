# TeleChat

Réseau social de discussion façon Telegram — messagerie 1:1 et de groupe, partage de médias, appels audio/vidéo. Front en Next.js/TypeScript, modération assistée par Python, base de données et temps réel via Supabase, hébergement Vercel.

## Architecture

Le projet est un monorepo **Vercel Services** : deux services indépendants déployés ensemble, sous un seul domaine.

```
telechat/
├── vercel.json          # déclare les services et le routage public
├── supabase/schema.sql  # schéma Postgres + RLS + realtime + storage
├── frontend/             # service "web" — Next.js 16 (App Router, TypeScript)
└── backend/              # service "moderation" — Python (Flask) sur /api/py/*
```

- **Frontend** (`frontend/`) : Next.js. Auth, UI, messagerie, upload média et signaling WebRTC passent directement par le client Supabase (SDK + Row Level Security), pas par une API perso.
- **Backend** (`backend/`) : une fonction Python (Flask) appelée par le frontend avant l'envoi d'un message pour la modération de contenu. Utilise Claude (Anthropic) si `ANTHROPIC_API_KEY` est défini, sinon un filtre par mots-clés.
- **Supabase** fournit : Postgres (données), Auth (comptes), Realtime (messages instantanés + signaling d'appel WebRTC), Storage (médias).
- **Appels audio/vidéo** : WebRTC pur (pas de serveur média). Le signaling (offer/answer/ICE) passe par un canal Supabase Realtime dédié à chaque conversation. Limité au 1:1 pour l'instant — les appels de groupe demanderaient un SFU (LiveKit, Daily...), hors scope V1.

## Mise en route

### 1. Créer le projet Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans le SQL Editor, exécute le contenu de `supabase/schema.sql`.
3. Dans **Storage**, crée un bucket nommé `media`, coché **Public**.
4. Récupère `Project URL` et `anon public key` dans **Project Settings > API**.

### 2. Configurer le frontend

```bash
cd frontend
cp .env.local.example .env.local
# renseigne NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

Optionnel — un serveur TURN (metered.ca, Twilio, ou coturn auto-hébergé) améliore la fiabilité des appels derrière des NAT stricts : renseigne `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`.

### 3. Configurer le backend de modération (optionnel en local)

```bash
cd backend
cp .env.example .env   # ANTHROPIC_API_KEY optionnel
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
flask --app main run -p 8000
```

Sans backend qui tourne, l'envoi de message fonctionne quand même : `moderate()` échoue silencieusement et `flagged` reste `false`.

### 4. Déployer sur Vercel

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add ANTHROPIC_API_KEY   # optionnel
vercel deploy --prod
```

`vercel.json` déclare les deux services (`web` = frontend, `moderation` = backend) et route `/api/py/*` vers le backend Python, tout le reste vers le frontend Next.js.

## Ce qui manque pour un vrai Telegram (V2+)

- **Canaux (broadcast)** : type `channel` déjà dans le schéma, UI à faire.
- **Appels de groupe** : nécessite un SFU (LiveKit/Daily) — WebRTC pur ne scale pas au-delà de 2 participants.
- **Chiffrement de bout en bout** : aucun chiffrement E2E aujourd'hui : Supabase voit le contenu en clair (comme Telegram Cloud Chats, mais sans le mode "Secret Chat").
- **Bots / API publique**.
- **Notifications push** (Web Push API).
- **Modération** : le filtre actuel est volontairement simple ; à muscler selon les besoins réels.
