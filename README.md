TELNET Sécurité
🎯 Présentation du projet

TELNET Sécurité est une plateforme web destinée à la gestion des événements, des incidents et des risques de sécurité. Elle permet de centraliser les déclarations, de faciliter leur analyse par le Responsable de la Sécurité des Systèmes d’Information et d’assurer la traçabilité des différentes actions réalisées.

L’application repose sur deux acteurs principaux :

Le Détecteur, qui déclare les événements de sécurité et suit leur état.
Le RSSI, qui analyse les événements reçus, les qualifie et assure le traitement des incidents et des risques associés.

Le RSSI évalue chaque événement selon trois critères :

Confidentialité
Intégrité
Disponibilité

Lorsqu’au moins un de ces impacts est critique, l’événement peut être qualifié comme incident et un plan de traitement est créé.

🎯 Fonctionnalités principales
Fonctionnalités du Détecteur
Création d’un compte.
Authentification sécurisée.
Récupération du mot de passe.
Gestion du profil.
Déclaration d’un événement de sécurité.
Modification d’une déclaration.
Consultation des événements déclarés.
Recherche textuelle et vocale.
Transmission d’un événement au RSSI.
Suivi de l’état de traitement.
Fonctionnalités du RSSI
Consultation de tous les événements reçus.
Recherche et filtrage des événements.
Réception de notifications visuelles et par e-mail.
Qualification selon les impacts CID.
Création et suivi des incidents.
Gestion des mesures d’atténuation.
Définition des responsables et des délais.
Gestion des actions correctives.
Gestion des risques associés.
Consultation du journal d’audit.
Consultation des statistiques.
Gestion du profil et des paramètres.
Utilisation de l’assistant intelligent.
Fonctionnalités de l’assistant intelligent
Réponse aux questions du RSSI.
Analyse du contexte d’un événement.
Recherche d’événements similaires.
Proposition de causes possibles.
Proposition de risques.
Proposition d’actions de traitement.
Génération de descriptions professionnelles.
Proposition de qualification CID.
Préparation d’un brouillon d’incident.
Remplissage assisté de certains champs.
Interaction textuelle ou vocale en français.
Conservation de l’historique des conversations dans le navigateur.
🎯 Architecture de l’application

L’application utilise une architecture composée de quatre parties principales.

Utilisateur
    |
    v
Frontend Angular
    |
    | Requêtes HTTP au format JSON
    v
Backend Spring Boot
    |
    |-------------------- MySQL
    |
    |-------------------- Gmail SMTP
    |
    |-------------------- Assistant Python
                              |
                              v
                         Ollama + Qwen 2.5
Frontend Angular

Le frontend représente la partie visible de l’application. Il gère :

les interfaces ;
les formulaires ;
les tableaux ;
les recherches ;
les graphiques ;
les notifications visuelles ;
la reconnaissance vocale ;
la synthèse vocale ;
l’adaptation aux écrans mobiles.
Backend Spring Boot

Le backend reçoit les demandes du frontend et assure :

l’authentification ;
le contrôle des accès ;
la validation des données ;
l’application des règles métier ;
la gestion des événements ;
la gestion des incidents ;
la gestion des risques ;
l’envoi des e-mails ;
le journal d’audit ;
la communication avec l’assistant Python.
Base de données MySQL

MySQL assure le stockage permanent des données suivantes :

utilisateurs ;
événements ;
incidents ;
risques ;
types d’incident ;
journaux d’audit.
Assistant intelligent

Le backend transmet les questions, les événements et les incidents au programme Python. Celui-ci normalise le texte, recherche les cas similaires et interroge le modèle local Qwen exécuté avec Ollama.

Si le modèle n’est pas disponible, un moteur de règles Python ou Java permet de conserver une réponse minimale.

🎯 Technologies et versions
Frontend

Versions déclarées dans frontend/package.json :

Technologie	Version déclarée	Utilisation
Angular Core	^22.0.0	Structure principale du frontend
Angular Common	^22.0.0	Fonctionnalités communes Angular
Angular Compiler	^22.0.0	Compilation Angular
Angular Forms	^22.0.0	Formulaires et validations
Angular Router	^22.0.0	Navigation entre les interfaces
Angular Platform Browser	^22.0.0	Exécution dans le navigateur
Angular CLI	^22.0.3	Commandes Angular
Angular Build	^22.0.3	Construction de l’application
Angular Compiler CLI	^22.0.0	Compilation des composants
TypeScript	~6.0.2	Langage du frontend
RxJS	~7.8.0	Traitements asynchrones
Chart.js	^4.5.1	Graphiques du tableau de bord
tslib	^2.3.0	Fonctions TypeScript partagées
Vitest	^4.0.8	Tests frontend
jsdom	^28.0.0	Simulation du navigateur pendant les tests
Prettier	^3.8.1	Formatage du code
npm	11.13.0	Gestion des dépendances frontend

Pour afficher les versions réellement installées :

cd frontend
npm list --depth=0
Backend
Technologie	Version	Utilisation
Java	21	Langage du backend
Spring Boot	3.5.15	Framework principal
JJWT	0.11.5	Création et validation des JWT
Maven Wrapper	3.3.4	Lancement automatique de Maven
Distribution Maven	3.9.16	Compilation du backend

La version Maven utilisée peut être vérifiée avec :

cd demo
.\mvnw.cmd -version
Dépendances Spring Boot

Les versions des dépendances suivantes sont gérées par Spring Boot 3.5.15 :

Spring Web
Spring Data JPA
Hibernate ORM
Spring Security
Spring Validation
Spring Mail
MySQL Connector/J
Lombok
Spring Boot Test
Spring Security Test

Pour afficher toutes les dépendances du backend :

cd demo
.\mvnw.cmd dependency:tree
Assistant intelligent
Technologie	Utilisation
Python 3	Analyse des questions et exécution du moteur de règles
Python 3.12	Version utilisée par les commandes d’installation
Ollama	Exécution locale du modèle
Qwen 2.5	Modèle conversationnel
qwen2.5:3b	Modèle configuré par défaut

Le programme Python utilise principalement la bibliothèque standard :

json
os
re
subprocess
urllib.request
unicodedata
difflib
pathlib
typing

Aucun paquet Python externe n’est obligatoire pour le fonctionnement actuel de l’assistant.

🎯 Installation complète
Installation du frontend

Ouvrir PowerShell dans le dossier du projet :

cd C:\chemin\vers\telnet\frontend
npm install

Compiler le frontend :

npm run build

Vérifier TypeScript :

npx tsc --noEmit -p tsconfig.app.json
Compilation du backend

Ouvrir un terminal dans le dossier demo :

cd C:\chemin\vers\telnet\demo
.\mvnw.cmd clean package

Pour compiler sans lancer les tests :

.\mvnw.cmd clean package -DskipTests

Pour vérifier uniquement la compilation :

.\mvnw.cmd compile

Maven Wrapper télécharge automatiquement Maven et les dépendances Java nécessaires.

🎯 Configuration de MySQL

Créer la base de données :

CREATE DATABASE IF NOT EXISTS telnet
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

Configuration principale dans :

demo/src/main/resources/application.properties

Exemple :

server.port=8081

spring.datasource.url=jdbc:mysql://localhost:3306/telnet
spring.datasource.username=root
spring.datasource.password=VOTRE_MOT_DE_PASSE

spring.jpa.open-in-view=false
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.database-platform=org.hibernate.dialect.MySQL8Dialect

La propriété suivante permet à Hibernate de créer ou de mettre à jour automatiquement les tables à partir des entités Java :

spring.jpa.hibernate.ddl-auto=update

Les principales entités se trouvent dans :

demo/src/main/java/com/example/demo/entity/

Les repositories permettant d’accéder à MySQL se trouvent dans :

demo/src/main/java/com/example/demo/repository/
🎯 Configuration Gmail

L’application utilise Spring Mail et Gmail SMTP pour informer le RSSI lorsqu’un événement lui est transmis.

Configuration dans :

demo/src/main/resources/application.properties
spring.mail.host=smtp.gmail.com
spring.mail.port=587
spring.mail.username=VOTRE_ADRESSE_GMAIL
spring.mail.password=${MAIL_APP_PASSWORD}

spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true
spring.mail.properties.mail.smtp.starttls.required=true
spring.mail.properties.mail.smtp.ssl.trust=smtp.gmail.com

app.mail.from=VOTRE_ADRESSE_GMAIL
app.mail.rssi=ADRESSE_DU_RSSI

Définir le mot de passe d’application Gmail dans PowerShell :

$env:MAIL_APP_PASSWORD="VOTRE_MOT_DE_PASSE_APPLICATION"
Adresse d’envoi

L’adresse utilisée pour envoyer le message est définie par :

spring.mail.username=VOTRE_ADRESSE_GMAIL
app.mail.from=VOTRE_ADRESSE_GMAIL
Adresse du RSSI

L’adresse qui reçoit les notifications est définie par :

app.mail.rssi=ADRESSE_DU_RSSI

Pour changer le destinataire, il suffit donc principalement de modifier cette propriété.

Le service Java utilise cette valeur dans :

demo/src/main/java/com/example/demo/service/EmailService.java

La propriété est récupérée avec :

@Value("${app.mail.rssi}")
private String defaultRssiEmail;

Le même fichier contient également une adresse de secours :

private static final String FIXED_RSSI_EMAIL = "adresse-de-secours@gmail.com";

Cette adresse est uniquement utilisée lorsque app.mail.rssi est vide. La personne qui reprend le projet peut également la modifier.

Logique d’envoi du message

La création simple d’un événement ne déclenche pas immédiatement l’e-mail. Le message est envoyé lorsque le Détecteur transmet l’événement au RSSI.
🎯 Lancement de l’application
Lancer le backend

Ouvrir un premier terminal :

cd C:\chemin\vers\telnet\demo
.\mvnw.cmd spring-boot:run

Le backend est disponible à l’adresse :

http://localhost:8081
Lancer le frontend

Ouvrir un second terminal :

cd C:\chemin\vers\telnet\frontend
npm start

ou :

npx ng serve

Le frontend est disponible à l’adresse :

http://localhost:4200

Angular doit être lancé depuis le dossier frontend, tandis que Spring Boot doit être lancé depuis le dossier demo.

🎯 Tests
Tests du frontend
cd frontend
npm test

Vérification TypeScript :

npx tsc --noEmit -p tsconfig.app.json

Compilation de production :

npm run build
Tests du backend
cd demo
.\mvnw.cmd test

Compilation complète :

.\mvnw.cmd clean package
Tests de l’assistant

Vérifier la présence du script :

python -m py_compile python\rssi_assistant.py

📱 Version mobile

La version mobile utilise la même application Angular que la version ordinateur. L’adaptation est réalisée avec le responsive design, les règles CSS @media et certaines conditions TypeScript.

Les principaux seuils utilisés dans le frontend sont notamment :

900 px
760 px
700 px
640 px
600 px
390 px

Sur un téléphone :

les tableaux sont transformés en cartes ;
certaines colonnes secondaires sont masquées ;
les formulaires passent sur une seule colonne ;
les boutons sont agrandis pour faciliter l’utilisation tactile ;
les filtres secondaires sont masqués ;
la barre de recherche reste accessible ;
le microphone reste intégré dans le champ de recherche ;
l’historique de l’assistant est fermé automatiquement ;
la zone de conversation s’adapte à la hauteur de l’écran ;
la fenêtre de reconnaissance vocale s’adapte au format mobile.

La logique principale de l’interface mobile se trouve dans :

frontend/src/app/components/dashboard.css

Les changements d’affichage interactifs se trouvent dans :

frontend/src/app/components/dashboard.ts
