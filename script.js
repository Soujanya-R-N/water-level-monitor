const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

/* MQTT Topics */

const tdsTopic = "soujanya/water/tds";
const levelTopic = "soujanya/water/level";

const motorStatusTopic = "soujanya/water/motor/status";
const motorControlTopic = "soujanya/water/motor/control";

const valveStatusTopic = "soujanya/water/valve/status";
const valveControlTopic = "soujanya/water/valve/control";

const deviceTopic = "soujanya/water/device/status";

/* HTML */

const motorToggle=document.getElementById("motorToggle");
const valveToggle=document.getElementById("valveToggle");

const water=document.getElementById("water");

/* Chart */

const ctx=document.getElementById("tdsChart");

const chart=new Chart(ctx,{
type:"line",
data:{
labels:[],
datasets:[{
label:"TDS",
data:[],
borderColor:"#2ecc71"
}]
},
options:{
responsive:true,
scales:{y:{beginAtZero:true}}
}
});

client.on("connect",()=>{

console.log("MQTT connected");

client.subscribe(tdsTopic);
client.subscribe(levelTopic);
client.subscribe(motorStatusTopic);
client.subscribe(valveStatusTopic);
client.subscribe(deviceTopic);

});

/* Toggle switches */

motorToggle.addEventListener("change",()=>{

if(motorToggle.checked)
client.publish(motorControlTopic,"ON");
else
client.publish(motorControlTopic,"OFF");

});

valveToggle.addEventListener("change",()=>{

if(valveToggle.checked)
client.publish(valveControlTopic,"OPEN");
else
client.publish(valveControlTopic,"CLOSE");

});

/* Receive MQTT messages */

client.on("message",(topic,message)=>{

const value=message.toString();

if(topic===tdsTopic){

document.getElementById("tds").innerText=value+" PPM";

chart.data.labels.push("");
chart.data.datasets[0].data.push(value);

if(chart.data.labels.length>20){
chart.data.labels.shift();
chart.data.datasets[0].data.shift();
}

chart.update();

}

/* Tank animation */

if(topic===levelTopic){

document.getElementById("level").innerText=value;

if(value==="EMPTY") water.style.height="10%";
if(value==="HALF") water.style.height="50%";
if(value==="FULL") water.style.height="90%";

}

/* Motor */

if(topic===motorStatusTopic){

document.getElementById("motor").innerText=value;

motorToggle.checked=(value==="ON");

}

/* Valve */

if(topic===valveStatusTopic){

document.getElementById("valve").innerText=value;

valveToggle.checked=(value==="OPEN");

}

/* Device status */

if(topic===deviceTopic){

document.getElementById("device").innerText=value;

}

});