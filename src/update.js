const ora = require('ora');
const chalk = require('chalk');
const fetch = require("node-fetch");
const packageJson = require('../package.json');
const inquirer = require('inquirer');
const fs = require("fs")
const https = require('https');
const { exec } = require('child_process');
const si = require("systeminformation");
const { dataDirectory, saladbind_directory, isExecutable } = require("./setup");
const path = require("path");

if (!fs.existsSync(dataDirectory)) {
	fs.mkdirSync(dataDirectory);
}

const updateCheck = new Promise((resolve, reject) => {
		let dirContent = fs.readdirSync(saladbind_directory);
		let instances = []
		var i = 0;

		for (i = 0; i < dirContent.length; i++) {
			if (dirContent[i].toLowerCase().includes("saladbind") || dirContent[i].toLowerCase().includes("salad bind")) {
				instances.push(dirContent[i])
			}
		}
		if (instances.length > 1) {
			setTimeout(function() {
				for (i = 0; i < instances.length; i++) {
					fs.unlink(`${saladbind_directory}/${instances[i]}`, function() {})
				}
			}, 5000)
		}
		let updateFailed = false;
		let timer = setTimeout(() => {
			spinner.fail("Could not search for updates!")
			setTimeout(() => resolve(), 3000);
		}, 10000);

		const spinner = ora('Checking for updates...').start();
		fetch('https://raw.githubusercontent.com/LITdevs/SaladBind/main/internal/changelog.json')
			.then(res => res.json())
			.then(data => {
				clearTimeout(timer);
				if(updateFailed) return; // to not mess up stuff if it recovers
				version = data.version
				if (version !== packageJson.version) {
					spinner.succeed(chalk.bold.green(`SaladBind ${data.version} is available!`));
					data.changelog.forEach(item => {
						console.log(`- ${item}`)
					});
					console.log();
					inquirer.prompt({
						name: "updatePrompt",
						message: "What do you want to do?",
						type: "list",
						choices: [{
								name: "Remind me later",
								value: "remindlater"
							},
							{
								name: "Automatically install update",
								value: "auto"
							}
						]
					}).then(out => {
						if (out.updatePrompt == "remindlater") resolve();
						else if (out.updatePrompt == "auto") {
							startUpdate();
						}
					})

				} else {
					spinner.stop();
					resolve();
				}
			})
	})
	.catch(err => {
		spinner.fail(chalk.bold.red(`Could not check for updates, please try again later.`));
		console.log(err);
		setTimeout(() => {
			resolve();
		}, 3500);
	});


async function startUpdate() {
	spinner = ora(`Downloading SaladBind v${version}`).start();
	platform = (await si.osInfo()).platform;
	if (platform == "darwin") {
		platform = "macos"
	}
	let link = `https://github.com/LITdevs/SaladBind/releases/download/v${version}/saladbind-${(platform == "Windows") ? "win.exe" : platform}`
	filename = link.substring(link.lastIndexOf('/') + 1)
	await downloadFile(link, `${dataDirectory}/${filename}`, `SaladBind v${version}`)
}

const downloadFile = async function(url, location, name) {
	return new Promise(async(resolve, reject) => {
		const stream = fs.createWriteStream(location);
		https.get(url, function(response) {
			if (parseInt(response.statusCode) >= 200 && parseInt(response.statusCode) < 300) {
				response.pipe(stream);
				stream.on('finish', function() {
					stream.close(function() {
						spinner.succeed(chalk.bold.green(`Downloaded ${name}`));
						installNew(location)
					});
				});
			} else {
				downloadFile(response.headers.location, location, name);
			}
		});
	});
}


const installNew = async function(location) {
	let isWindows = platform == "Windows"
	if (isExecutable) {
		let argumentsOfMove = []
		if (platform == "Windows") {
			argumentsOfMove.push(['-y'])
		}
		argumentsOfMove.push([`${dataDirectory}/${filename}`, process.execPath])
		exec(`${isWindows ? 'rd' : 'rm'} ${process.execPath} && ${isWindows ? 'move -y' : 'mv'} ${dataDirectory}/${filename} ${saladbind_directory}/${filename}`)
		spinner.succeed(chalk.bold.green(`${filename} has been updated!`))
	}
	if (isWindows) {
		process.exit(0)
	}
}

module.exports = {
	updateCheck,
}
