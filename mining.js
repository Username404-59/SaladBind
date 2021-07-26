const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs');
const fetch = require("node-fetch");
const si = require("systeminformation");
const https = require('https');
const path = require('path');
let spinner;


async function downloadFile(url, location, name) {
    const stream = fs.createWriteStream(location);
    const request = await https.get(url, function(response) {
        if(parseInt(response.statusCode) >= 200 && parseInt(response.statusCode) < 300) { 
            response.pipe(stream);
            stream.on('finish', function() {
                stream.close(function(){
                    spinner.succeed(chalk.bold.green(`Downloaded ${name}`));
                });
            });
        } else {
            downloadFile(response.headers.location, location, name);
        }
    });
}

async function run() {
    if (!fs.existsSync("./data/miners")){
        fs.mkdirSync("./data/miners");
    }
    console.clear();
    console.log(chalk.bold.cyan(`Configure your miner`))
    spinner = ora("Loading miner list").start();
    fetch('https://raw.githubusercontent.com/VukkyLtd/SaladBind/main/internal/miners.json?token=ALJSKC4Y47KW2EIR7TCUDFDA722W4')
        .then(res => res.json())
        .then(async data => {
            spinner.stop();
            let minerList = [];
            let temp = await si.osInfo()
            let temp2 = await si.graphics()
            let userPlatform = temp.platform;
            let GPUs = [];
            console.log(temp2.controllers[0].vram)
            for (let i = 0; i < temp2.controllers.length; i++) {
                let compatibleAlgos = []
                for (let j = 0; j < Object.keys(data.algos).length; j++) {
                    if(temp2.controllers[i].vram > data.algos[Object.keys(data.algos)[i]]) {
                        compatibleAlgos.push(Object.keys(data.algos)[i])
                    }
                }
                GPUs.push({"algos": compatibleAlgos, "vendor": temp2.controllers[i].vendor});
            }
            console.log(GPUs);
            for (let i = 0; i < Object.keys(data.miners).length; i++) {
                const minerSupportsOS = data.miners[Object.keys(data.miners)[i]].supported_os.includes(userPlatform)
                const minerSupportsGPU = GPUs.filter(gpu => data.miners[Object.keys(data.miners)[i]].algos.includes(gpu.algos) && data.miners[Object.keys(data.miners)[i]].supported_gpus.includes(gpu.vendor.toLowerCase())).length > 0
                if(minerSupportsOS && minerSupportsGPU) {
                    minerList.push({
                        name: data.miners[Object.keys(data.miners)[i]].miner,
                        value: data.miners[Object.keys(data.miners)[i]]
                    });
                }
            }
            if (minerList.length == 0) {
                spinner.stop();
                console.log(chalk.bold.red("No miners are available for your machine D:\nIf you think this is a mistake, talk to us on our Discord server."));
                setTimeout(() => {
                    require("./index").menu();
                }, 6000);
            } else {
                const miner = await inquirer.prompt({
                    type: "list",
                    name: "miner",
                    message: "Choose a miner",
                    choices: minerList
                });
                spinner = ora(`Downloading ${miner.miner.miner}-${miner.miner.version}`).start();
                var downloadURL = miner.miner.download[userPlatform];
                const fileExtension = path.extname(downloadURL);
                const fileName = `${miner.miner.miner}-${miner.miner.version}`
                const fileLocation = `./data/miners/${fileName}${fileExtension}`; 
                await downloadFile(downloadURL, fileLocation, fileName);
            }
        })
        .catch(err => {
            spinner.fail(chalk.bold.red(`Could not start a miner. Please try again later.`));
            console.log(err);
            setTimeout(() => {
                require("./index").menu();
            }, 3500);
        });
}

module.exports = {
    run
};