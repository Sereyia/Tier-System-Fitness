# Muscu : application de suivi de musculation (PWA)

Application web installable, 100 % hors ligne après la première ouverture, pour faire tourner un programme de musculation en salle, série par série, sur un smartphone.

- Aucun compte, aucun serveur, aucune analytique : chaque personne garde ses données uniquement sur son téléphone.
- L'appli se partage par un simple lien. Chaque téléphone qui ouvre le lien démarre avec sa propre base, vide, et le programme préchargé.
- Version actuelle : **V1** (séance complète, moteur de charge, sauvegarde). Historique détaillé, cycles, éditeur de programme : V2. Cardio, import CSV, très gros caractères : V3.

## Contenu du dossier

```
index.html               page unique de l'appli
manifest.webmanifest     manifeste PWA (nom, icônes, couleurs)
sw.js                    Service Worker : cache hors ligne et mises à jour
css/                     thème (palette) et mise en page
icons/                   icônes 192 et 512 px
js/engine/               moteur de calcul pur (charges, programme, supersets, rotation), testé
js/data/                 IndexedDB (schéma versionné), programme préchargé, sauvegarde JSON
js/ui/                   écrans et logique d'interface
tests/                   tests automatiques (node --test)
package.json             lance les tests avec « npm test »
```

## 1. Publier sur GitHub Pages (gratuit)

1. Crée un compte sur https://github.com si tu n'en as pas.
2. Crée un nouveau dépôt public (bouton « New repository »), par exemple `muscu`. Choisis un nom définitif : l'adresse du site en dépend.
3. Dans le dépôt, clique sur « Add file », puis « Upload files ». Glisse **tout le contenu** de ce dossier (pas le dossier lui-même) : `index.html`, `sw.js`, `manifest.webmanifest`, les dossiers `css`, `icons`, `js`, `tests`, etc. Valide avec « Commit changes ».
4. Va dans « Settings », puis « Pages ». Dans « Build and deployment », choisis « Deploy from a branch », branche `main`, dossier `/ (root)`, puis « Save ».
5. Attends une à deux minutes. L'adresse s'affiche en haut de la page « Pages », sous la forme `https://ton-pseudo.github.io/muscu/`.

Important : **l'adresse doit rester stable**. Les données de chaque utilisateur sont liées à l'adresse du site. Si tu renommes le dépôt ou changes de compte, chacun repart d'une base vide et doit exporter puis réimporter sa sauvegarde.

## 2. Partager le lien

Envoie simplement l'adresse (`https://ton-pseudo.github.io/muscu/`) par message. Il n'y a rien d'autre à partager : aucune donnée personnelle n'est dans le code.

## 3. Installer sur le téléphone

**Android (Chrome)**
1. Ouvre le lien dans Chrome, avec une connexion internet (première ouverture).
2. Menu (trois points en haut à droite), puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».
3. Lance l'appli depuis son icône. Elle fonctionne ensuite en mode avion.

**iPhone (Safari)**
1. Ouvre le lien dans Safari.
2. Bouton Partager, puis « Sur l'écran d'accueil ».
3. Utilise toujours l'appli depuis cette icône : sur iPhone, c'est indispensable pour que les données soient conservées durablement. Les vibrations ne sont pas garanties sur iPhone.

## 4. Première utilisation

L'assistant demande seulement :
- un prénom (facultatif, affiché sur l'accueil) ;
- le poids de corps (pour les exercices lestés comme les tractions) ;
- les charges de référence des 9 exercices T1 : la charge avec laquelle tu ferais environ 6 reps en gardant 2 à 3 reps en réserve. Haltères : poids d'un seul haltère. Tractions : lest ajouté (0 sans lest). Tu peux laisser vide : la charge sera demandée à la première séance.

Les autres charges sont demandées à la première exposition de chaque exercice : choisis une charge prudente, l'appli ajuste ensuite à partir de ce que tu fais réellement.

## 5. En séance

- Une seule série à l'écran. Le poids et les reps sont préremplis ; choisis ton RIR ressenti puis « Fait ».
- Après « Fait », un bandeau « Série enregistrée · Annuler » permet de corriger pendant 5 secondes.
- L'écran de repos affiche le repos conseillé et le temps écoulé, sans compte à rebours. Passe à la suite avec « Série suivante ».
- Le bouton « ... » donne accès à : Faire séparément (superset), Notes, Ajouter une série, Sauter cette série.
- « Séance » ouvre la vue d'ensemble pour aller à un autre exercice ou corriger une série validée.
- « Arrêter la séance » enregistre les séries faites et marque la séance « partielle », sans effet sur la progression des exercices non faits.
- Chaque série est écrite immédiatement sur le téléphone : un appel ou une fermeture de l'appli ne fait perdre que la série en cours. Une séance interrompue se reprend depuis l'accueil.

## 6. Sauvegarde et restauration

**Vider les données du navigateur ou désinstaller l'appli efface tout l'historique. Seule la sauvegarde exportée le protège.**

- Exporter : Réglages, puis « Exporter ma sauvegarde » (ou le bouton de l'accueil). Sur Android, le menu de partage s'ouvre : envoie le fichier vers Google Drive, un e-mail ou une messagerie. Sinon, le fichier est téléchargé. Nom du fichier : `sauvegarde-muscu-AAAA-MM-JJ.json`.
- L'accueil affiche un rappel si aucune sauvegarde n'a été exportée depuis plus de 7 jours.
- Restaurer : Réglages, puis « Importer une sauvegarde », choisis le fichier, puis **maintiens le bouton 2 secondes**. L'import remplace toutes les données ; une sauvegarde interne des données actuelles est faite juste avant.
- Sauvegardes internes : les 5 dernières sont gardées dans l'appli (avant chaque import ou restauration). Elles ne protègent pas d'un effacement des données du navigateur.

## 7. Import CSV d'un programme

Prévu en V3.

## 8. Mettre à jour l'appli

1. Remplace les fichiers modifiés dans le dépôt GitHub (« Add file », « Upload files »).
2. À chaque publication, change la version du cache dans `sw.js` (ligne `const CACHE_VERSION = 'muscu-v1.0.0';`, par exemple `muscu-v1.0.1`) et `APP_VERSION` dans `js/ui/app.js`.
3. Sur les téléphones, à l'ouverture suivante, l'accueil affiche « Nouvelle version disponible · Mettre à jour ». La nouvelle version ne s'active qu'au tap sur ce bouton, jamais pendant une séance.

Les mises à jour ne touchent jamais aux données : le schéma de la base est versionné et chaque évolution passe par une migration (`js/data/db.js`, objet `MIGRATIONS`).

## 9. Format de la sauvegarde (version 1)

Fichier JSON lisible sans l'appli :

```json
{
  "format": "muscu-backup",
  "formatVersion": 1,
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-11-16T18:30:00+01:00",
  "data": {
    "meta": [], "exercises": [], "programs": [], "cycles": [], "sessions": [], "sets": [],
    "references": [], "bodyweight": [], "correspondences": [], "cycleTemplates": []
  }
}
```

Rubriques principales de `data` :

| Rubrique | Contenu |
|---|---|
| `meta` | `settings` (réglages), `state` (pointeur de rotation, cycle en cours, date du dernier export), `schema` |
| `exercises` | bibliothèque : nom, patterns, matériel, unité, éligibilité au top set, muscles directs et indirects, consigne, notes |
| `programs` | blocs (paramètres par tier), séances types (slots, supersets), ordre de rotation, repos des supersets |
| `cycles` | cycles (numéro, nombre de rotations, dates) |
| `sessions` | séances : statut (`complete`, `partial`, `in_progress`), dates, bloc, séance type, plan détaillé, fatigue |
| `sets` | une ligne par série validée : date et heure, séance, bloc, exercice, type de série (`top`, `work`, `power`, `finisher`), charge, reps, RIR, vitesse, charge proposée, poids de corps, max estimé (`e1rm`), record (`pr`) |
| `references` | charges de référence (équivalent bloc Force) par exercice |
| `bodyweight` | historique du poids de corps |
| `correspondences` | ratios entre exercices (estimations, utilisés à partir de la V2) |
| `cycleTemplates` | modèles de cycle (V2) |

Conventions : dates en ISO 8601 avec le fuseau local ; charges en kg ; pour les haltères, poids d'un seul haltère ; pour les exercices au poids du corps lestés, la charge est le lest (négatif = assistance) ; RIR toujours stocké en RIR, même si l'affichage est en RPE (RPE = 10 - RIR).

## 10. Tests

Avec Node.js 20 ou plus récent, dans ce dossier :

```
npm test
```

ou `node --test`. Aucune dépendance à installer. Les tests couvrent le moteur de charge (dont l'exemple de référence et les tests de stabilité sur 12 séances), l'héritage des blocs, les top sets, les supersets et leurs repos, l'arrêt de séance, la rotation, la sauvegarde, le contraste des couleurs et la liste des fichiers mis en cache hors ligne.
