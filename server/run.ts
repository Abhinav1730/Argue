import "dotenv/config";import {createRoomServer} from "./index";import {serverConfig} from "./config";const server=createRoomServer(serverConfig());await server.start();console.log("Relay room service listening on port "+server.port);

