const express = require('express');
const mqtt = require('mqtt');

const app = express();
const PORT = 3003;

// const brokerUrl = 'ws://192.168.29.212:9001';
const brokerUrl = 'ws://192.168.89.166:9001';
const topic = 'test/topic';
const clientId = `node_client_${Date.now()}`;

const client = mqtt.connect(brokerUrl, {
  clientId,
  keepalive: 20,
  reconnectPeriod: 1000,
  connectTimeout: 30 * 1000,
});

let isConnected = false;
let score = null;  

client.on('connect', () => {
  isConnected = true;
  console.log('Connecté au broker MQTT');
  client.subscribe(topic, (err) => {
    if (!err) {
      console.log(`Abonné au topic : ${topic}`);
    }
  });
});

client.on('message', (topic, message) => {
  const messageContent = message.toString();
  console.log(`Message reçu : ${messageContent} depuis le topic : ${topic}`);

  if (!isNaN(messageContent)) {
    score = messageContent;
  }
});

client.on('error', (error) => {
  console.error('Erreur de connexion MQTT :', error);
  client.end();
});

app.get('/start', (req, res) => {
  if (isConnected) {
    client.publish(topic, 'start', (err) => {
      if (err) {
        res.status(500).send('Erreur lors de la publication');
      } else {
        res.send('Message "start" publié sur MQTT');
      }
    });
  } else {
    res.status(500).send('Non connecté au broker MQTT');
  }
});

app.get('/publish', (req, res) => {
  const message = 'Hello MQTT';
  if (isConnected) {
    client.publish(topic, message, (err) => {
      if (err) {
        res.status(500).send('Erreur lors de la publication');
      } else {
        res.send(`Message publié sur MQTT : ${message}`);
      }
    });
  } else {
    res.status(500).send('Non connecté au broker MQTT');
  }
});

app.get('/', (req, res) => {
  res.send(`
    <h1>MQTT Client</h1>
    <p>${isConnected ? 'Connecté au broker MQTT' : 'Connexion en cours...'}</p>
    <button onclick="fetch('/start').then(response => response.text()).then(alert)">Démarrer</button>
    <button onclick="fetch('/publish').then(response => response.text()).then(alert)">Publier un message</button>
    <h2>Score : ${score !== null ? score : 'Aucun score reçu'}</h2>
    <script>
      function publish() {
        fetch('/publish')
          .then(response => response.text())
          .then(alert);
      }

      function start() {
        fetch('/start')
          .then(response => response.text())
          .then(alert);
      }
      
      setInterval(() => {
        fetch('/')
          .then(response => response.text())
          .then(html => {
            document.body.innerHTML = html;
          });
      }, 2000);
    </script>
  `);
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});
