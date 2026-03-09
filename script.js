const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

const tdsTopic = "soujanya/water/tds";
const levelTopic = "soujanya/water/level";
const motorStatusTopic = "soujanya/water/motor/status";
const valveStatusTopic = "soujanya/water/valve/status";

const motorControlTopic = "soujanya/water/motor/control";
const valveControlTopic = "soujanya/water/valve/control";

client.on('connect',()=>{

console.log("MQTT Connected");

client.subscribe(tdsTopic);
client.subscribe(levelTopic);
client.subscribe(motorStatusTopic);
client.subscribe(valveStatusTopic);

});

client.on('message',(topic,message)=>{

const value = message.toString();

if(topic===tdsTopic){
document.getElementById("tds").innerText=value+" PPM";
}

if(topic===levelTopic){
document.getElementById("level").innerText=value;
}

if(topic===motorStatusTopic){
document.getElementById("motor").innerText=value;

if(value==="ON"){
document.getElementById("motorTime").innerText=new Date().toLocaleTimeString();
}
}

if(topic===valveStatusTopic){
document.getElementById("valve").innerText=value;

if(value==="OPEN"){
document.getElementById("valveTime").innerText=new Date().toLocaleTimeString();
}
}

});

/* Controls */

function motorON(){
client.publish(motorControlTopic,"ON");
}

function motorOFF(){
client.publish(motorControlTopic,"OFF");
}

function valveOPEN(){
client.publish(valveControlTopic,"OPEN");
}

function valveCLOSE(){
client.publish(valveControlTopic,"CLOSE");
}