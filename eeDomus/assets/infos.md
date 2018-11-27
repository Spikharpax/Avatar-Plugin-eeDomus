# eeDomus

Permet de controler votre domotique par Avatar.

### Configuration

Remplacez IP_ADRESS dans la propriété "ip" par l'adresse IP de votre box eedomus

**exemple:**
192.168.0.12/api

Remplacez "USER" dans la propriété "user", l'utilisateur pour l'API eedomus
Remplacez "SECRET" dans la propriété "secret", le password de l'utilisateur de l'API eedomus

### Utilisation

Toutes les commandes sont multirooms, si vous ne précisez pas le nom de la pièce dans la règle, la pièce courante est utilisée.
Sinon, vous pouvez préciser le nom de la pièce.
Par exemple:
- Allume la lumière
	- (dans la pièce courante)
- Allume la lumière dans la cuisine


<br>
**Attention!!**
Tous les ID de dimmers laissés dans le plugin sont donnés à titre d'exemples.
**Vous devez impérativement les changer par les votres ou les supprimer !!**
<br>
Les commandes données à titre d'exemples dans ce plugin sont les suivantes:

**Allume/Eteins la lumière**
- Ajoutez dans chaque propriété "lightDimmer" pour chaque pièce, l'ID du périphérique de controle de la lumière.
- Si vous avez plusieurs dimmers à gérer en même temps, vous pouvez aussi mettre plusieurs ID dans un tableau (voir l'exemple pour la pièce "Cuisine")

<br>
**Met la lumière en couleur [blanc chaud, vert pomme, rouge, cyan, bleu, magenta, orange, jaune]**
- Ajoutez dans la propriété "lightColor" pour chaque pièce, l'ID du périphérique de controle de la couleur.

Vous pouvez ajouter des valeurs de couleur dans le tableau "lightColor" (voir les valeurs existantes)

<br>

**Met l'intensité de la lumière à [10, 40, 50, 100] pour 100**
- Ajoutez dans la propriété "lightVariator" pour chaque pièce, l'ID du périphérique de controle de l'intensité.
- Vous povez aussi dire:
	- Met l'intensité de la lumière au maximum
    - Met l'intensité de la lumière au minimum
    
Vous pouvez ajouter des valeurs d'intensité dans le tableau "lightVariator" (voir les valeurs existantes)

<br>
<br>
<br>