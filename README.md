TELNET Sécurité
Présentation du projet

TELNET Sécurité est une plateforme web destinée à la gestion des événements, des incidents et des risques de sécurité. Elle permet de centraliser les déclarations, de faciliter leur analyse par le RSSI et d’assurer le suivi complet du processus de traitement.Le fonctionnement général est le suivant :

Le Détecteur déclare un événement.
L’événement est transmis au RSSI.
Le RSSI évalue les impacts sur la confidentialité, l’intégrité et la disponibilité.
Si au moins un impact est critique, l’événement est qualifié comme incident.
Un plan d’incident est créé pour enregistrer les mesures d’atténuation, le traitement, les responsables et les risques.
Les actions réalisées sont conservées dans le journal d’audit.
Le tableau de bord fournit des statistiques sur les événements et les incidents.
L’Assistant RSSI aide à analyser les situations et à préparer les formulaires.echnologies, frameworks et versions
Frontend

Versions déclarées dans frontend/package.json :

Technologie	Version
Angular Core	^22.0.0
Angular Common	^22.0.0
Angular Compiler	^22.0.0
Angular Forms	^22.0.0
Angular Router	^22.0.0
Angular Platform Browser	^22.0.0
Angular CLI	^22.0.3
Angular Build	^22.0.3
Angular Compiler CLI	^22.0.0
TypeScript	~6.0.2
RxJS	~7.8.0
Chart.js	^4.5.1
tslib	^2.3.0
Vitest	^4.0.8
jsdom	^28.0.0
Prettier	^3.8.1
npm	11.13.0

Angular est utilisé pour construire l’interface web. TypeScript permet d’écrire le code frontend avec un typage plus strict. Chart.js est utilisé pour afficher les graphiques du tableau de bord.

Les symboles ^ et ~ signifient que npm peut installer une version compatible plus récente.

Pour afficher les versions réellement installées :

cd frontend
npm list --depth=0
Backend

Versions déclarées dans demo/pom.xml :

Technologie	Version
Java	21
Spring Boot	3.5.15
JJWT API	0.11.5
JJWT Impl	0.11.5
JJWT Jackson	0.11.5
Backend	0.0.1-SNAPSHOT

Dépendances principales gérées par Spring Boot :

Spring Web ;
Spring Data JPA ;
Spring Security ;
Spring Validation ;
Spring Mail ;
Hibernate ORM ;
MySQL Connector/J ;
Lombok ;
Spring Boot Test ;
Spring Security Test.
Base de données
Technologie	Version
MySQL Server	Non fixée dans le projet
MySQL Connector/J	Gérée par Spring Boot
Hibernate ORM	Gérée par Spring Boot
Jakarta Persistence / JPA	Gérée par Spring Boot

MySQL est utilisé pour enregistrer durablement les données.

La version installée peut être affichée avec :

mysql --version
Logiciels utilisés
Visual Studio Code

Utilisé pour :

Angular ;
TypeScript ;
HTML ;
CSS ;
Java ;
Python ;
fichiers de configuration.
