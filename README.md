# 🛡️ TELNET Sécurité

## 🎯 Présentation du projet

TELNET Sécurité est une plateforme web de gestion des événements, incidents et risques de sécurité, enrichie par des fonctionnalités d’**intelligence artificielle et de machine learning** afin d’assister le RSSI dans son travail quotidien.

La plateforme permet de centraliser les déclarations de sécurité, de les analyser, de les qualifier selon les critères de **Confidentialité, Intégrité et Disponibilité (CID)** et d’assurer le suivi des incidents et des risques. L’intelligence artificielle occupe une place importante dans le projet grâce à un **assistant intelligent**, à l’analyse automatique du contexte, au remplissage assisté de formulaires, à la recherche de cas similaires, aux recommandations de traitement et aux interactions vocales.

L’application repose principalement sur deux acteurs : le **Détecteur**, chargé de déclarer les événements de sécurité et de suivre leur traitement, et le **RSSI**, chargé de les analyser, de les qualifier et de gérer les incidents et risques associés.

## ⚙️ Fonctionnalités principales

Le Détecteur peut créer et gérer son compte, déclarer ou modifier un événement de sécurité, consulter ses déclarations, effectuer des recherches textuelles ou vocales, transmettre un événement au RSSI et suivre son état de traitement.

Le RSSI dispose d’outils lui permettant de consulter et filtrer les événements, réaliser leur qualification CID, créer et suivre les incidents, gérer les risques, les mesures d’atténuation et les actions correctives, définir les responsables et les délais, consulter les statistiques et le journal d’audit, ainsi qu’exploiter les fonctionnalités d’intelligence artificielle intégrées à la plateforme.

## 🤖 Intelligence artificielle et Machine Learning

L’intelligence artificielle constitue une partie importante de TELNET Sécurité. Elle a été intégrée afin d’aider le RSSI à analyser plus rapidement les informations disponibles, à réduire les tâches manuelles et à faciliter la prise de décision lors du traitement des événements de sécurité.

Le projet utilise un **assistant intelligent basé sur Qwen 2.5**, exécuté localement avec **Ollama** et intégré à l’application grâce à un programme **Python**. Qwen est un modèle d’intelligence artificielle reposant sur des techniques de machine learning et de traitement automatique du langage naturel.

L’assistant peut analyser le contenu d’un événement de sécurité et tenir compte de son contexte afin de fournir des suggestions adaptées. Il peut notamment proposer des **causes possibles**, identifier des **risques potentiels**, suggérer des **actions de traitement** et aider le RSSI à déterminer une qualification selon les critères de Confidentialité, d’Intégrité et de Disponibilité.

L’IA permet également de rechercher des **événements similaires** déjà présents dans le système. Cette fonctionnalité aide le RSSI à comparer un nouvel événement avec des situations précédentes et à exploiter les informations déjà disponibles pour faciliter son analyse.

Le système propose également un **remplissage assisté par intelligence artificielle**. À partir des informations d’un événement, l’assistant peut générer ou proposer automatiquement certaines données utiles, comme une description professionnelle, des risques, des actions de traitement ou des éléments nécessaires à la préparation d’un incident. Le RSSI conserve la possibilité de vérifier et de modifier les propositions avant leur utilisation.

L’assistant peut également préparer un **brouillon d’incident** à partir d’un événement analysé. Cette fonctionnalité permet de réduire la saisie manuelle et d’accélérer la préparation du traitement tout en laissant la décision finale au RSSI.

Les interactions avec l’application peuvent être réalisées par **texte ou par voix en français**. La reconnaissance vocale facilite la saisie des recherches et des demandes adressées à l’assistant, tandis que les fonctionnalités vocales améliorent l’accessibilité et la rapidité d’utilisation de la plateforme.

L’historique des échanges avec l’assistant est conservé dans le navigateur afin de permettre au RSSI de retrouver le contexte de ses précédentes interactions.

Enfin, lorsque le modèle d’intelligence artificielle n’est pas disponible, un **moteur de règles** permet de conserver certaines fonctionnalités d’assistance et de fournir des réponses minimales. Cette approche permet de rendre le système plus robuste et de ne pas dépendre entièrement du modèle d’IA.

L’objectif de ces fonctionnalités n’est pas de remplacer le RSSI, mais de lui fournir un **outil d’aide à l’analyse et à la décision** permettant de gagner du temps, de mieux structurer les informations et de faciliter le traitement des événements, incidents et risques de sécurité.

## 🧰 Technologies utilisées

**Angular 22.0.0** — développement de l’interface web.
**Angular CLI 22.0.3** — gestion et compilation du projet Angular.
**TypeScript 6.0.2** — développement du frontend.
**RxJS 7.8.0** — gestion des traitements asynchrones.
**Chart.js 4.5.1** — affichage des statistiques et graphiques.
**Java 21** — développement du backend.
**Spring Boot 3.5.15** — développement des services backend et de la logique métier.
**JJWT 0.11.5** — gestion de l’authentification avec JWT.
**Maven 3.9.16** — gestion et compilation du projet backend.
**MySQL** — stockage des utilisateurs, événements, incidents, risques et journaux d’audit.
**Python 3.12** — traitement des fonctionnalités de l’assistant intelligent et du moteur de règles.
**Ollama** — exécution locale du modèle d’intelligence artificielle.
**Qwen 2.5 / qwen2.5:3b** — modèle d’intelligence artificielle utilisé par l’assistant.

## 📱 Version mobile

TELNET Sécurité utilise une interface responsive basée sur la même application Angular pour les environnements ordinateur et mobile. L’affichage s’adapte automatiquement à la taille de l’écran afin de faciliter la consultation des événements, l’utilisation des formulaires, la recherche, les interactions vocales et l’accès à l’assistant intelligent depuis un smartphone.
