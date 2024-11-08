const express = require('express');
const mqtt = require('mqtt');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('Connecté à MongoDB simon_game');

    mongoose.connection.db.listCollections().toArray((err, collections) => {
      if (err) {
        console.error('Erreur lors de la récupération des collections :', err);
      } else {
        console.log('Collections disponibles :', collections.map(c => c.name));
      }
    });
  })
  .catch((error) => console.error('Erreur de connexion à MongoDB :', error));

const scoreSchema = new mongoose.Schema({
  topic: String,
  payload: {
    username: String,
    score: Number,
  },
  qos: Number,
  retain: Boolean,
  _msgid: String,
  date: { type: Date, default: Date.now }
}, { collection: 'scores' }); // Spécifiez la collection 'scores'

const Score = mongoose.model('Score', scoreSchema);

const brokerUrl = process.env.BROKER_URL || 'mqtt://192.168.89.166:1883';
const startTopic = process.env.START_TOPIC || 'simon/start';
const scoreTopic = process.env.SCORE_TOPIC || 'simon/score';
const clientId = `node_client_${Date.now()}`;
const client = mqtt.connect(brokerUrl, {
  clientId,
  keepalive: 20,
  reconnectPeriod: 1000,
  connectTimeout: 30 * 1000,
});

let isConnected = false;

client.on('connect', () => {
  isConnected = true;
  console.log('Connecté au broker MQTT');
  client.subscribe([scoreTopic], (err) => {
    if (!err) {
      console.log(`Abonné au topic : ${scoreTopic}`);
    } else {
      console.error(`Erreur lors de l'abonnement au topic : ${err.message}`);
    }
  });
});

client.on('message', (topic, message) => {
  try {
    const messageContent = JSON.parse(message.toString());
    console.log(`Message reçu : ${JSON.stringify(messageContent)} depuis le topic : ${topic}`);

    if (topic === scoreTopic) {
      if (typeof messageContent.username === 'string' && typeof messageContent.score === 'number') {
        const { username, score } = messageContent;
        console.log(`Score reçu : ${score} pour l'utilisateur ${username}`);
      } else {
        console.warn('Le message reçu ne contient pas un username ou un score valide.');
      }
    }
  } catch (e) {
    console.error('Erreur lors de l\'analyse du message MQTT :', e);
  }
});

client.on('error', (error) => {
  console.error('Erreur de connexion MQTT :', error);
  client.end();
});

app.post('/start', (req, res) => {
  const { username } = req.body;
  if (username) {
    console.log(`Session démarrée avec le pseudonyme : ${username}`);

    const startMessage = JSON.stringify({ action: 'start', username });
    client.publish(startTopic, startMessage, { qos: 0, retain: false }, (err) => {
      if (err) {
        console.error('Erreur lors de la publication du message start MQTT :', err);
        res.status(500).send('Erreur lors du démarrage de la session');
      } else {
        console.log(`Message start publié sur le topic ${startTopic}`);
        res.send(`Session démarrée avec le pseudonyme : ${username}`);
      }
    });
  } else {
    res.status(400).send('Pseudonyme non fourni');
  }
});

app.get('/scores', async (req, res) => {
  try {
    const allScores = await Score.find().sort({ date: -1 });
    res.json(allScores);
  } catch (error) {
    console.error('Erreur lors de la récupération des scores :', error);
    res.status(500).send('Erreur lors de la récupération des scores');
  }
});

app.get('/', async (req, res) => {
  try {
    const allScores = await Score.find().sort({ date: -1 });
    console.log(`Scores récupérés : ${JSON.stringify(allScores)}`);

    res.send(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MQTT Client</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: #f4f4f9;
            color: #333;
            margin: 0;
            padding: 20px;
          }
          h1 {
            color: #0066cc;
          }
          .status {
            margin: 10px 0;
            font-size: 1.2em;
          }
          button {
            padding: 10px 20px;
            margin: 5px;
            font-size: 1em;
            cursor: pointer;
            border: none;
            border-radius: 5px;
            background-color: #007BFF;
            color: #fff;
            transition: background-color 0.3s;
          }
          button:hover {
            background-color: #0056b3;
          }
          .score-list {
            margin-top: 20px;
            font-size: 1em;
            color: #333;
            width: 100%;
            max-width: 600px;
          }
          .score-item {
            display: flex;
            justify-content: space-between;
            padding: 10px;
            border-bottom: 1px solid #ddd;
          }
          .score-item:nth-child(even) {
            background-color: #f9f9f9;
          }
          .score-username {
            font-weight: bold;
          }
          .score-value {
            color: #007BFF;
          }
          .score-date {
            font-size: 0.9em;
            color: #666;
          }
        </style>
      </head>
      <body>
        <h1>MQTT Client</h1>
        <p class="status">${isConnected ? 'Connecté au broker MQTT' : 'Connexion en cours...'}</p>
        <button onclick="start()">Démarrer une session</button>
        <div class="score-list">
          <h2>Scores :</h2>
          ${allScores.length > 0 ? allScores.map(score => `
            <div class="score-item">
              <span class="score-username">${score.payload.username || 'Anonyme'}</span>
              <span class="score-value">${score.payload.score}</span>
              <span class="score-date">${new Date(score.date).toLocaleDateString()}</span>
            </div>
          `).join('') : '<p>Aucun score disponible.</p>'}
        </div>

        <script>
          function start() {
            const username = prompt("Entrez votre pseudonyme:");
            if (username) {
              fetch('/start', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username }),
              })
              .then(response => response.text())
              .then(alert);
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Erreur lors de la récupération des scores :', error);
    res.status(500).send('Erreur lors du chargement de la page');
  }
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});
