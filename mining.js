const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs');
const fetch = require("node-fetch");
const si = require("systeminformation");
const https = require('https');
const path = require('path');
const decompress = require('decompress');
const decompressTargz = require('decompress-targz');
const decompressUnzip = require('decompress-unzip');
const mv = require('mv'); //what i forogt to save :bukky:
const { menu } = require('./index');
let tempest = "./data/config.json";
let rawdata = fs.readFileSync(tempest);
const config = JSON.parse(rawdata);
const { win32 } = require('path');
const { spawn } = require("child_process");
let spinner;

function moveDupeFolder(folderName) {
	let folderData = fs.readdirSync(`./data/miners/${folderName}`)
	if(folderData.length == 1) {
		mv(`./data/miners/${folderName}/${folderData[0]}`, `./data/miners/${folderName}`, {clobber: false}, function(err) { //oh okers
			// done. it tried fs.rename first, and then falls ba	ck to
			// piping the source file to the dest file and then unlinking
			// the source file. (docs lol) lol
			if(err) {
				console.log(chalk.bold.red(err));
				spinner.fail();
			}
		});
	}
}

async function extractFile(location, folderName, fileExtension) {
    if (!fs.existsSync(`./data/miners/${folderName}`)){
		fs.mkdirSync(`./data/miners/${folderName}`); // me too
	}
	await decompress(location, `./data/miners/${folderName}`, {
		plugins: [
			decompressTargz(),
			decompressUnzip()
		],
		map: (file) => {
			if (file.type === 'file' && file.path.endsWith('/')) {
			  file.type = 'directory'
			}
			return file
		}
	}).then(() => {
		fs.unlinkSync(location);
		moveDupeFolder(folderName);
	})
	spinner.succeed(chalk.bold.green(`Extracted ${folderName}`));
} 

const downloadFile = async function(url, location, name) {
    return new Promise(async (resolve, reject) => {
        const stream = fs.createWriteStream(location);
        const request = https.get(url, function(response) {
            if(parseInt(response.statusCode) >= 200 && parseInt(response.statusCode) < 300) { 
                response.pipe(stream);
                stream.on('finish', function() {
                    stream.close(function(){
                        spinner.succeed(chalk.bold.green(`Downloaded ${name}`));
                        resolve();
                    });
                });
            } else {
                downloadFile(response.headers.location, location, name).then(() => {
					resolve();
				});
			}
        });
    });
}

async function run() {
	if (!fs.existsSync("./data/miners")){
		fs.mkdirSync("./data/miners");
	}
	console.clear();
	console.log(chalk.bold.cyan(`Configure your miner`))
	spinner = ora("Loading miner list").start();
	fetch('https://raw.githubusercontent.com/VukkyLtd/SaladBind/main/internal/miners.json') //fuck you token
		.then(res => res.json())
		.then(async data => {
			spinner.text = "Checking your specs";
			let minerList = [];
			let temp = await si.osInfo()
			let temp2 = await si.graphics() 
			let userPlatform = temp.platform; 
			let GPUs = [];  
			for (let i = 0; i < temp2.controllers.length; i++) {
				let compatibleAlgos = []
				for (let j = 0; j < Object.keys(data.algos).length; j++) {
					if(temp2.controllers[i].vendor == "Advanced Micro Devices, Inc.") temp2.controllers[i].vendor = "AMD";
					if(temp2.controllers[i].vram > data.algos[Object.keys(data.algos)[j]]) { 
						compatibleAlgos.push(Object.keys(data.algos)[j])
					}
				}
				if (compatibleAlgos.length > 0) {
					GPUs.push({"algos": compatibleAlgos, "vendor": temp2.controllers[i].vendor.toLowerCase()});
				}
			}
			for (let i = 0; i < Object.keys(data.miners).length; i++) {
				let minerData = data.miners[Object.keys(data.miners)[i]];
				const minerSupportsOS = minerData.supported_os.includes(userPlatform)
				const algosSupportsGPU = minerData.algos.filter(algo => GPUs.filter(gpu => gpu.algos.includes(algo)).length > 0).length > 0
				const minerSupportsGPU = GPUs.filter(gpu => minerData.supported_gpus.includes(gpu.vendor)).length > 0
				if(minerSupportsOS && minerSupportsGPU && algosSupportsGPU) {
					if (GPUs.filter(gpu => minerData.algos.filter(algo => gpu.algos.includes(algo)).length > 0).length != GPUs.length) {
						minerList.push({
							name: `${minerData.miner} ${chalk.yellow("(Not supported by some of your GPUs)")}`,
							value: minerData
						});
					} else {
						minerList.push({
							name: minerData.miner,
							value: minerData
						});
					}
				}
			}
			spinner.stop();
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
				if (fs.existsSync(`./data/miners/${miner.miner.miner}-${miner.miner.version}`)) {
					let minerFolder = fs.readdirSync(`./data/miners/${miner.miner.miner}-${miner.miner.version}`);
					if (!minerFolder.filter(file => file.startsWith(miner.miner.parameters.fileName)).length > 0) {
						fs.rmSync(`./data/miners/${miner.miner.miner}-${miner.miner.version}`, {recursive: true});
					}
				}
				if(!fs.existsSync(`./data/miners/${miner.miner.miner}-${miner.miner.version}`)) {
					let miners = fs.readdirSync("./data/miners");
					let oldMiners = miners.filter(minery => minery.startsWith(miner.miner.miner));
					if(oldMiners.length > 0) { //woo! time for pools.json (and more fucking tokens) oh piss
						console.log(chalk.yellow(`A ${miner.miner.miner} update has been found! Updating now..`));
						oldMiners.forEach(miner => fs.rmSync(`./data/miners/${miner}`, {recursive: true}));
					}
					spinner = ora(`Downloading ${miner.miner.miner}-${miner.miner.version}`).start();
					var downloadURL = miner.miner.download[userPlatform];
					var fileExtension = path.extname(downloadURL); //time for a really hacky solution. this 
					if (fileExtension == ".gz") {
						fileExtension = ".tar.gz"
					}
					const fileName = `${miner.miner.miner}-${miner.miner.version}`
					const fileLocation = `./data/miners/${fileName}${fileExtension}`; 
					downloadFile(downloadURL, fileLocation, fileName).then(async () => {
						spinner = ora(`Extracting ${miner.miner.miner}-${miner.miner.version}`).start();
						await extractFile(fileLocation, fileName, fileExtension)
						selectAlgo(miner.miner, GPUs);
					});
				} else {
					selectAlgo(miner.miner, GPUs);
				}
			} 
		}).catch(err => {
			spinner.fail(chalk.bold.red(`Could not start the miner, please try again later.`)); // haha screw you
			console.log(err);
			setTimeout(() => {
				require("./index").menu();
			}, 3500);
		});
}

async function selectAlgo(minerData, GPUs) {
	console.clear();
	console.log(chalk.bold.cyan(`Configure your miner`))
	let algoList = [];
	const gpuSupportsAlgo = minerData.algos.filter(algo => GPUs.filter(gpu => gpu.algos.includes(algo)).length > 0)
	const temptemp = GPUs.filter(gpu => minerData.algos.filter(algo => gpu.algos.includes(algo)).length > 0)
	for (let i = 0; i < gpuSupportsAlgo.length; i++) { //im having a really bhig stroke
		let notSupportedByAll;
		for (let j = 0; j < GPUs.length; j++) {
			if(!GPUs[j].algos.includes(gpuSupportsAlgo[i])) {
				notSupportedByAll = true;
			}
		}
		if (notSupportedByAll == true) { // now. the cursed. pool selection and miner running. ok pool selection is only needed if ethash is selected
			algoList.push({name: `${gpuSupportsAlgo[i]} ${chalk.yellow("(Not supported by some of your GPUs)")}`, value: gpuSupportsAlgo[i]});
		} else {
			algoList.push({name: gpuSupportsAlgo[i], value: gpuSupportsAlgo[i]});
		}
	} 
	const algo = await inquirer.prompt({
		type: "list", 
		name: "algo",
		message: "Choose an algorithm",
		choices: algoList
	});
	selectPool(minerData, algo.algo);
}

async function selectPool(minerData, algo) {
	console.clear();
	console.log(chalk.bold.cyan(`Configure your miner`))
	spinner = ora("Loading pool list").start();
	fetch('https://raw.githubusercontent.com/VukkyLtd/SaladBind/main/internal/pools.json') //fuck you token
		.then(res => res.json())
		.then(async poolData => {
			spinner.stop();
			const poolList = [];
			for (let i = 0; i < Object.keys(poolData).length; i++) {
				let pooly = poolData[Object.keys(poolData)[i]];
				if (Object.keys(pooly.algos).includes(algo)) {
					if (minerData.miner != "Ethminer") {
						poolList.push({name: pooly.name, value: pooly});
					} else if (pooly.name == "Ethermine") {
						poolList.push({name: pooly.name, value: pooly});
					}
				}
			}
			let pool;
			if(poolList.length > 1) {
				pool = await inquirer.prompt({
					type: "list",
					name: "pool",	
					message: "Choose a pool",
					choices: poolList
				});
			} else {
				console.log(chalk.green(`Only one pool available with these settings, using ${poolList[0].name}`))
			}
			const regionList = [];
			const poolsy = poolList.length > 1 ? pool.pool : poolList[0].value;
			for (let i = 0; i < poolsy.regions.length; i++) {
				regionList.push({name: poolsy.regions[i], value: poolsy.regions[i]});
			}
			const region = await inquirer.prompt({
				type: "list",
				name: "region",
				message: "Choose a region",
				choices: regionList
			});
			prepStart(minerData, algo, poolsy, region.region);
		}).catch(err => {
			spinner.fail(chalk.bold.red(`Could not select a pool, please try again later.`));
			console.log(err);
			setTimeout(() => {
				require("./index").menu();
			}, 3500);
		});
}

async function prepStart(minerData, algo, pool, region, advancedCommands) {
	if(advancedCommands == undefined) advancedCommands = ""
	console.clear();
	console.log(chalk.bold.cyan(`Configure your miner`))
	const startNow = await inquirer.prompt({
		type: "list",
		name: "startNow",
		message: "Start miner now?",
		choices: [
			{
				name: "Yes", 
				value: "y"
			}, 
			{
				name: "No", 
				value: "n"
			},
			{
				name: "Set advanced commands", 
				value: "advanced"
			}
		]
	});
	switch (startNow.startNow) {
		case "y":
			startMiner(minerData, algo, pool, region, advancedCommands);
		break;
		case "n":
			require("./index").menu();
		break;
		case "advanced":
			console.log("To exit, just press enter without typing anything.");
			const advancedCommandsy = await inquirer.prompt({
				type: "input",
				name: "advancedCommands",
				message: "Enter arguments for miner",
			});
			prepStart(minerData, algo, pool, region, advancedCommandsy.advancedCommands); 
			break;
	}
}

async function startMiner(minerData, algo, pool, region, advancedCommands) {
	console.clear();
	console.log(`${chalk.bold.greenBright("Starting miner!")}\nPlease wait, this might take a few seconds.\n`);
	let minerFiles = fs.readdirSync(`data/miners/${minerData.miner}-${minerData.version}`);
	let wallet
	switch(pool.name) {
		case "Ethermine":
			wallet = "0x6ff85749ffac2d3a36efa2bc916305433fa93731" // i swear if this isnt the right address i will kill bob's mother update: bob your mother is safe.
		break;
		case "NiceHash":
			wallet = "33kJvAUL3Na2ifFDGmUPsZLTyDUBGZLhAi" // tested to work i swear
		break;
	}
	let defaultArgs = {}
	if (minerData.parameters.wallet != "") { // poo
		if(minerData.parameters.wallet == "PHOENIX") {
			if(algo == "ethash") {
				defaultArgs.wallet = `-wal ${wallet}.${config.minerId}`
				defaultArgs.algo = `-coin eth`
				defaultArgs.pool = `${minerData.parameters.pool} ${pool.algos[algo].host.replace("REGION", region)}${minerData.miner == "PhoenixMiner" && pool.name == "NiceHash" ? " -proto 4 " : ""}${minerData.miner == "lolMiner" ? " --pers BgoldPoW " : ""}`
			} else if(algo == "etchash") {
				defaultArgs.wallet = `-wal ${wallet}.${config.minerId}`
				defaultArgs.algo = `-coin etc`
				defaultArgs.pool = `${minerData.parameters.pool} ${pool.algos[algo].host.replace("REGION", region)}${minerData.miner == "PhoenixMiner" && pool.name == "NiceHash" ? " -proto 4 " : ""}${minerData.miner == "lolMiner" ? " --pers BgoldPoW " : ""}`
			} else {
				console.log(chalk.blue("something went badly wrong"))
			}
		} else {
			defaultArgs.wallet = `${minerData.parameters.wallet} ${wallet}.${config.minerId}`
			if (minerData.parameters.algo != "") {
				defaultArgs.algo = `${minerData.parameters.algo} ${minerData.miner == "lolMiner" ? algo == "beamv3" ? "BEAM-III" : algo.toUpperCase() : algo}`
			} else {
				defaultArgs.algo = ""
			}
			defaultArgs.pool = `${minerData.parameters.pool} ${pool.algos[algo].host.replace("REGION", region)}${minerData.miner == "PhoenixMiner" && pool.name == "NiceHash" ? " -proto 4 " : ""}${minerData.miner == "lolMiner" ? " --pers BgoldPoW " : ""}`
			} //i grabbed this from an older build because i accidentally removed a part so it didnt have it yet im a fucking retard
	} else {
		let poolUrl = pool.algos[algo].host
		let poolScheme = poolUrl.split("://")[0]
		poolScheme = poolScheme.replace("stratum", "stratum2")
		poolScheme = poolScheme.replace("ethproxy", "stratum1")
		let restOfPool = poolUrl.split("://")[1].replace("REGION", region)
		defaultArgs = {
			"algo": "",
			"pool": `${minerData.parameters.pool} ${poolScheme}://${wallet}.${config.minerId}@${restOfPool}`,
			"wallet": ""
		} //thats behind the if statement
		if (minerData.parameters.algo != "") {
			defaultArgs.algo = `${minerData.parameters.algo} ${algo}`
		}
	}
	if(advancedCommands.length > 0) { // didnt workkkk
		// i turned them into a string, it's because of inquirer remember, like when we have to do pool.pool
		// *****user has set advanced commands*****					ok then???
		let finalArguments = []
		if(!advancedCommands.includes(minerData.parameters.pool)) {
			finalArguments.push(defaultArgs.pool)
		}
		if(!advancedCommands.includes(minerData.parameters.wallet)) {
			finalArguments.push(defaultArgs.wallet) //why null WHY NULL TELLL MMEEE
		}
		if(!advancedCommands.includes(minerData.parameters.algo)) {
			finalArguments.push(defaultArgs.algo)
		}
		//advancedCommands.split(" ").forEach(arg => {
		//	finalArguments.push(arg);
		//}); time for a hacky fix!

		finalArguments.push(advancedCommands)
		let miner = spawn(`cd data/miners/${minerData.miner}-${minerData.version} && ${minerData.parameters.fileName}`, finalArguments, {stdio: 'inherit', shell: true, env : { FORCE_COLOR: true }}) //its an array dumbass
		miner.on('close', (code) => {
			console.log(`\nMiner stopped!\n`);
			require("./index").menu(false);
		});
		miner.on('SIGINT', () => {
			console.log(`\nMiner stopped!\n`);
			require("./index").menu(false);
		});
		process.on('SIGINT', () => {
			console.log(chalk.yellow("Returning to SaladBind menu..."));
		});
	} else {
		console.log([defaultArgs.pool, defaultArgs.algo, defaultArgs.wallet])
		let miner = spawn(`cd data/miners/${minerData.miner}-${minerData.version} && ${minerData.parameters.fileName}`, [defaultArgs.pool, defaultArgs.algo, defaultArgs.wallet], {stdio: 'inherit', shell: true, env : { FORCE_COLOR: true }})
		miner.on('close', (code) => {
			console.log(`\nMiner stopped!\n`);
			require("./index").menu(false);
		});
		miner.on('SIGINT', () => { // Bukky be Retarded
			console.log(`\nMiner stopped!\n`);
			require("./index").menu(false);
		});// nvm
		process.on('SIGINT', () => {
			console.log(chalk.yellow("Returning to SaladBind menu...")); // hadnt saved lol
			
		}) 
		// This spaghetti is powered by https://stackoverflow.com/a/44851254
	}
} 

module.exports = { 
	run
};