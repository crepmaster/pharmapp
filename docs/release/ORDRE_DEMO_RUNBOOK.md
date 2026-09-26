# Démonstration à l’Ordre des pharmaciens — staging, 28 septembre 2026

Périmètre : trois sessions web distinctes sur `mediexchange-staging` (pharmacie vendeuse, pharmacie acheteuse, coursier), dans Ghana / Kumasi, en GHS. Utiliser les trois comptes dédiés décrits dans `ORDRE_DEMO_STAGING_FIXTURES.md`. Leur licence et leur abonnement sont **fictifs et réservés à staging**. Ne jamais présenter ces comptes comme des pharmacies réellement habilitées.

## Avant d’ouvrir les trois sessions

1. Vérifier que `expand` puis `contract` et `verify` du déploiement staging ont réussi, avec preuve des artefacts distants et recette des deux parcours. Ne pas changer de projet Firebase pendant la démonstration.
2. Ouvrir trois profils ou fenêtres privées indépendants sur `https://mediexchange-staging.web.app`. Se connecter avec les rôles vendeur, acheteur et coursier du fichier local ignoré `functions/.demo-backups/credentials.json`. Ne pas afficher les mots de passe au public.
3. Vérifier dans l’interface que les deux pharmacies sont à Kumasi, que le solde est affiché en **GHS**, et que le lot de paracétamol du vendeur est **privé** au départ. Le lot d’ibuprofène de l’acheteur peut rester privé : il sera offert en contrepartie de l’échange.
4. Garder ouverte la vue **Proposals** du vendeur et la vue des commandes disponibles du coursier. Prévoir une actualisation si une liste ne se rafraîchit pas immédiatement.

## Parcours A — cession / vente

1. **Vendeur — Inventory :** publier le lot de paracétamol avec **Publish to Marketplace**. Vérifier qu’il devient visible dans le marché de l’autre pharmacie et que la quantité offerte correspond à celle choisie.
2. **Acheteur — Marketplace :** ouvrir ce lot, choisir **Make Proposal**, sélectionner **Purchase**, proposer une petite quantité (par exemple 2 boîtes) et un prix unitaire en GHS. Vérifier le montant total avant **Submit Purchase Proposal**.
3. **Vendeur — Proposals :** ouvrir la proposition reçue et l’accepter. L’acceptation crée un ordre de transport lié à la proposition.
4. **Coursier — commandes disponibles :** ouvrir l’ordre, contrôler l’origine, la destination, le médicament, la quantité et le prix de livraison en GHS, puis **Accept This Delivery**. Parcourir ensuite les quatre actions : **Start pickup**, **Confirm pickup**, **Start delivery**, **Confirm delivered**.
5. **Deux pharmacies :** vérifier que la proposition et la livraison sont terminées, que le lot est sorti du stock disponible du vendeur et est entré chez l’acheteur, et que les soldes et le coursier affichent les mouvements attendus en GHS.

## Parcours B — échange réciproque

1. **Acheteur — Marketplace :** choisir de nouveau le lot publié de paracétamol. Dans **Make Proposal**, sélectionner **Exchange**, demander une petite quantité de paracétamol et offrir le lot privé d’ibuprofène avec sa quantité. Le lot offert n’a pas besoin d’être publié sur le marché.
2. **Vendeur — Proposals :** contrôler les deux médicaments et accepter. L’ordre de transport doit montrer **l’aller et le retour avant que le coursier ne l’accepte**. Les deux lots sont alors réservés ; ils ne sont pas encore transférés à leur destinataire.
3. **Coursier :** accepter l’ordre, puis suivre l’aller : **Start pickup**, **Confirm pickup**, **Start delivery**, **Confirm delivered**. À ce point, vérifier que l’aller est reçu mais que l’échange n’est **pas encore réglé** et que le retour reste à effectuer.
4. **Coursier :** suivre le retour : **Start return pickup**, **Confirm return pickup**, **Start return delivery**, **Confirm return delivered**. La dernière confirmation déclenche le règlement et le transfert des deux lots, une seule fois.
5. **Deux pharmacies :** vérifier l’historique et le suivi des deux segments, les quantités reçues, les frais de coursier partagés et la devise GHS. Un clic répété sur la dernière étape ne doit pas doubler les mouvements.

## Ce que la démonstration établit

Les écritures de proposition, réservation, ordre, affectation, suivi et règlement passent par les fonctions serveur et sont vérifiables dans Firestore et le ledger. `stockTransit` représente la garde physique entre l’enlèvement et la réception ; `reservedQuantity` reste la réservation logique jusqu’au règlement. Le parcours du coursier est une **progression manuelle de staging** : elle ne constitue pas une preuve indépendante de remise, de scan QR, de géolocalisation, de température ou de conformité réglementaire. Les incidents après enlèvement exigent encore un traitement manuel. Ces sujets sont à cadrer avec l’Ordre pour un pilote réel.

## Si un parcours échoue pendant la démo

Conserver l’identifiant de la proposition et celui de la livraison, l’heure et l’étape affichée. Ne pas forcer `reset` sur une livraison engagée et ne pas effacer les documents : ils portent les réservations et l’historique financier. La recette staging doit avoir été exécutée une première fois avant lundi, avec deux transactions terminées et leurs preuves consultables en secours.
