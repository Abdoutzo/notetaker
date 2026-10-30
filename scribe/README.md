# Scribe : transcription et compte-rendu de réunions (gratuit)

Page web perso : tu l'ouvres sur ton PC pendant un appel (Teams, Meet, Zoom, ou téléphone sur haut-parleur), tu enregistres, et tu obtiens la **transcription** et un **compte-rendu** (résumé, décisions, actions, questions ouvertes).

- 100 % statique : pas de serveur à maintenir, hébergement gratuit (Vercel, Netlify, Cloudflare Pages).
- Le navigateur appelle directement les APIs gratuites (Groq et, en option, Gemini).
- Tes clés API et ton historique restent **dans ton navigateur** (localStorage + IndexedDB).

## Les 3 modes

| Mode | Ce qui est enregistré | Qui parle ? |
|---|---|---|
| **Réunion sur ce PC** | Ton micro + le son du PC (partage d'écran/onglet avec audio) sur 2 pistes séparées | Oui : « Moi » / « Interlocuteur » |
| **Appel sur téléphone** | Le micro du PC, téléphone sur haut-parleur posé à côté | Non (le résumé le déduit du contexte) |
| **Importer un fichier** | Un enregistrement existant (mp3, m4a, wav, ogg, webm, mp4…) | Non |

Navigateur : **Chrome ou Edge sur ordinateur** (Firefox et Safari ne savent pas capturer le son du PC).

Fonctionnement : l'audio est découpé en segments de 5 min, transcrits **pendant** la réunion. À l'arrêt, il ne reste que le dernier segment et le résumé à faire : le compte-rendu arrive en moins d'une minute. Si le quota gratuit est atteint, l'app attend et réessaie toute seule. Si l'onglet est fermé par erreur, les segments déjà enregistrés sont conservés et peuvent être traités (« Reprendre le traitement »). L'audio est supprimé du navigateur une fois transcrit.

## Benchmark des options gratuites (octobre 2026)

Besoin : 1 réunion par jour, 1 h max, gratuit, bonne qualité en français.

### Transcription (speech-to-text)

| Service | Gratuit ? | Limites gratuites | Qualité FR | Verdict |
|---|---|---|---|---|
| **Groq, Whisper large-v3-turbo** | Oui, permanent, sans carte | ~7 200 s d'audio/heure, ~28 800 s/jour (8 h), 25 Mo/fichier | Très bonne | ✅ **Choisi** |
| Deepgram Nova-3 | Crédit unique ~200 $ | S'épuise | Très bonne, diarisation | Bien mais pas gratuit à vie |
| AssemblyAI | Crédit unique ~50 $ | S'épuise | Très bonne, diarisation | Idem |
| Gemini (audio direct) | Oui | 20 à 250 requêtes/jour selon le modèle | Bonne, horodatage moins fiable | Possible mais moins précis que Whisper |
| Whisper local (dans le navigateur) | Oui | Aucune | Correcte | Trop lent pour 1 h sur un PC classique |

Avec 2 pistes (toi + l'autre), 1 h de réunion consomme 7 200 s : ça tient dans le quota quotidien (8 h). La séparation des pistes donne « qui parle » **gratuitement**, sans service de diarisation payant.

### Résumé (LLM)

| Service | Gratuit ? | Limites | Point fort | Point faible |
|---|---|---|---|---|
| **Groq (Llama 3.3 70B par défaut)** | Oui | ~6 à 12k tokens/minute selon le modèle | Même clé que la transcription ; données non utilisées pour l'entraînement | 1 h de transcription dépasse la limite par minute : l'app résume par morceaux puis fusionne (1 à 3 min) |
| **Gemini Flash (option)** | Oui | ~250k tokens/minute, 20+ requêtes/jour | Toute la réunion en un seul appel, très bon résumé | En gratuit, **Google peut utiliser les données** pour améliorer ses produits |

**Recommandation :** Groq pour tout (une seule clé, plus confidentiel). Ajoute Gemini si tu veux des résumés un peu meilleurs sur les longues réunions et que le contenu n'est pas confidentiel. Si Gemini échoue, l'app bascule automatiquement sur Groq.

> Les quotas gratuits changent régulièrement. Les vrais chiffres de ton compte sont sur [console.groq.com/settings/limits](https://console.groq.com/settings/limits) et dans [Google AI Studio](https://aistudio.google.com).

## Mise en route

### 1. Créer les clés (gratuites, sans carte bancaire)

1. **Groq (obligatoire)** : [console.groq.com/keys](https://console.groq.com/keys) → *Create API Key* → copie la clé `gsk_…`.
2. **Gemini (facultatif)** : [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → *Create API key*.

### 2. Déployer sur Vercel (gratuit, 3 minutes)

1. Va sur [vercel.com/new](https://vercel.com/new) et connecte-toi avec GitHub.
2. Importe le repo `notetaker`.
3. Dans **Root Directory**, choisis `scribe`.
4. **Framework Preset** : `Other`. Ne mets aucune commande de build.
5. Clique sur **Deploy**. Tu obtiens une URL du type `https://scribe-xxx.vercel.app`.

À chaque `git push`, Vercel redéploie tout seul.

Alternatives équivalentes : Netlify (glisser-déposer du dossier `scribe` sur [app.netlify.com/drop](https://app.netlify.com/drop)) ou Cloudflare Pages (même réglage : dossier `scribe`, pas de build).

### 3. Première utilisation

1. Ouvre l'URL dans Chrome ou Edge sur ton PC. Ajoute-la en favori.
2. Les réglages s'ouvrent : colle ta clé Groq, clique **Vérifier les clés**, puis **Enregistrer**.
3. Dans les réglages, renseigne aussi ton prénom, celui de l'interlocuteur habituel si tu veux, et le **vocabulaire** (noms propres, sigles) : ça améliore beaucoup l'orthographe.
4. Fais un essai de 1 minute avant une vraie réunion.

### Tester en local (facultatif)

```bash
cd scribe
```

```bash
python3 -m http.server 8000
```

Puis ouvre http://localhost:8000. Pour vérifier le découpage sans attendre 5 minutes : http://localhost:8000/?segment=20 (segments de 20 s).

## Conseils pour une bonne qualité

- **Réunion PC** : porte un **casque**. Sans casque, ton micro capte aussi la voix de l'autre ; l'app supprime la plupart de ces doublons, mais le casque reste le plus fiable.
- **Teams/Zoom en application** : partage *Écran entier* et coche *Partager l'audio du système* (Windows). Sur Mac, si l'option n'apparaît pas, utilise Teams/Meet dans un onglet Chrome et partage cet onglet avec son audio.
- **Téléphone** : haut-parleur, téléphone posé à 20-50 cm du PC, pièce calme.
- Garde l'onglet Scribe ouvert pendant l'appel (il peut être en arrière-plan).
- Préviens toujours les participants que tu enregistres.

## Structure

```
scribe/
├── index.html        page unique
├── styles.css
└── js/
    ├── app.js        interface, file de traitement, historique
    ├── recorder.js   capture micro / son du PC, découpage en segments de 5 min
    ├── audio-file.js import de fichier : décodage, mono 16 kHz, segments WAV de 10 min
    ├── api.js        Groq (Whisper + chat), Gemini, gestion des quotas et des reprises
    ├── transcript.js nettoyage des hallucinations Whisper, fusion Moi/Interlocuteur, Markdown
    └── db.js         stockage local IndexedDB
```

## Confidentialité

- Les clés sont stockées dans le `localStorage` de ton navigateur et envoyées uniquement à `api.groq.com` et `generativelanguage.googleapis.com` (une Content-Security-Policy bloque toute autre destination).
- L'audio et les transcriptions sont stockés localement (IndexedDB). L'audio est effacé après transcription ; les comptes-rendus restent jusqu'à ce que tu les supprimes.
- N'importe qui peut ouvrir ton URL Vercel, mais sans tes clés il ne peut rien consommer ni voir : chaque navigateur a son propre historique.
