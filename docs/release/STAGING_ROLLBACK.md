# Retour ciblé staging après un `expand` partiel

`expand` n'est pas atomique. Il capture **avant** la première mutation un dossier
local ignoré `.deploy/rollback-before-<sha8>-<timestamp>/` avec `manifest.json`
et `sources/<function>.zip`. Garder ce dossier. Le manifeste contient les
générations GCS des anciennes sources, les deux versions Hosting et le ruleset
actif. Le script refuse `expand` si les sources ne peuvent pas être téléchargées
ou si le versioning de leur bucket GCS est désactivé.

La restauration ci-dessous cible **uniquement** `mediexchange-staging`. Elle
ne restaure pas les index Firestore, les données créées par la recette, ni une
éventuelle modification des variables d'environnement ou du trafic Cloud Run
faite hors de ce déployeur. Elle suppose que les anciennes générations GCS,
versions Hosting et règles immuables existent encore. Ne pas effacer le
snapshot après la démo. Si un Function nouvellement ajouté ne figure pas
dans le snapshot, il faudra l'identifier et le retirer séparément après
revue ; ce bloc ne supprime aucune Function.

La séquence restaure d'abord les anciennes Rules si `contract` les a changées,
puis les deux sites, puis le code des Functions. Elle crée une **nouvelle**
révision de chaque Function à partir de sa source précédente. Ce n'est pas un
retour instantané de tout le projet. Après chaque appel, contrôler la réponse ;
arrêter sur la première erreur. Commandes PowerShell depuis la racine du dépôt,
avec `gcloud` authentifié pour le projet staging :

```powershell
$snapshotFile = '.deploy/rollback-before-REMPLACER/manifest.json'
$s = Get-Content -LiteralPath $snapshotFile -Raw | ConvertFrom-Json
if ($s.project -ne 'mediexchange-staging') { throw 'Snapshot hors staging' }
$token = gcloud auth print-access-token
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token Google absent' }
$headers = @{ Authorization = "Bearer $token" }

# Rules : réutilise le ruleset immuable capturé avant expand.
$rulesUrl = 'https://firebaserules.googleapis.com/v1/projects/mediexchange-staging/releases/cloud.firestore'
$rulesBody = @{ name = $s.rules.release; rulesetName = $s.rules.ruleset } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri $rulesUrl -Headers $headers -ContentType 'application/json' -Body $rulesBody | Out-Null

# Hosting : publie une nouvelle release pointant vers la version antérieure.
foreach ($site in @($s.hosting.app, $s.hosting.admin)) {
  $version = [uri]::EscapeDataString($site.version)
  $url = "https://firebasehosting.googleapis.com/v1beta1/sites/$($site.site)/releases?versionName=$version"
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body '{}' | Out-Null
}

# Functions v2 : source ancienne seulement ; attendre chaque opération longue.
foreach ($f in $s.functions) {
  $name = "projects/mediexchange-staging/locations/europe-west1/functions/$($f.name)"
  $url = "https://cloudfunctions.googleapis.com/v2/$($name)?updateMask=buildConfig.source"
  $body = @{ name = $name; buildConfig = @{ source = @{ storageSource = $f.source } } } | ConvertTo-Json -Depth 8
  $operation = Invoke-RestMethod -Method Patch -Uri $url -Headers $headers -ContentType 'application/json' -Body $body
  if (-not $operation.name) { throw "Operation absente pour $($f.name)" }
  do {
    Start-Sleep -Seconds 5
    $state = Invoke-RestMethod -Method Get -Uri "https://cloudfunctions.googleapis.com/v2/$($operation.name)" -Headers $headers
  } until ($state.done)
  if ($state.error) { throw "Restauration $($f.name) : $($state.error.message)" }
}
```

Vérifier ensuite que les deux `channels/live` Hosting pointent vers les
versions du snapshot, que le release Rules pointe vers son ruleset, et que
chaque Function v2 `ACTIVE` expose `buildConfig.source.storageSource` avec
la génération capturée. Contrôler les parcours métier avant de rouvrir la
démonstration. Le fichier `sources/*.zip` permet un secours manuel si une
génération GCS a expiré ; il ne suffit pas à reconstruire les paramètres de
déploiement d'une Function et ne doit pas être publié dans Git.

Références API officielles :
[Functions v2 PATCH](https://cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/patch),
[Hosting release](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.releases/create),
[Rules release PATCH](https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/patch).
