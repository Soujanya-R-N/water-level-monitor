const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

/* MQTT Topics */

const bottomTopic = "soujanya/water/bottom";
const topTopic = "soujanya/water/top";
const tdsTopic = "soujanya/water/tds";
const motorStatusTopic = "soujanya/water/motor/status";
const motorControlTopic = "soujanya/water/motor/control";

/* HTML Elements */

const bottomText = document.getElementById("bottom");
const topText = document.getElementById("top");
const tdsText = document.getElementById("tds");
const motorText = document.getElementById("motor");

/* MQTT Connect */

client.on('connect', () => {

console.log("Connected to MQTT");

client.subscribe(bottomTopic);
client.subscribe(topTopic);
client.subscribe(tdsTopic);
client.subscribe(motorStatusTopic);

});

/* Receive Data */

client.on('message',(topic,message)=>{

const value = message.toString();

if(topic === bottomTopic){
bottomText.innerText = value;
}

if(topic === topTopic){
topText.innerText = value;
}

if(topic === tdsTopic){
tdsText.innerText = value;
}

if(topic === motorStatusTopic){
motorText.innerText = value;
}

});

/* Motor Control */

function motorON(){
client.publish(motorControlTopic,"ON");
}

function motorOFF(){
client.publish(motorControlTopic,"OFF");
}