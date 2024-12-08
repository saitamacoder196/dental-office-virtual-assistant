// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const path = require('path');

const dotenv = require('dotenv');
// Import required bot configuration.
const ENV_FILE = path.join(__dirname, '.env');
dotenv.config({ path: ENV_FILE });

const restify = require('restify');

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
const { BotFrameworkAdapter } = require('botbuilder');

// This bot's main dialog.
const { DentaBot } = require('./bot');

// Create HTTP server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`\n${server.name} listening to ${server.url}`);
    console.log('\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator');
    console.log('\nTo talk to your bot, open the emulator select "Open Bot"');
});

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about how bots work.
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId, // Bot App ID from Azure
    appPassword: process.env.MicrosoftAppPassword, // Bot App Password from Azure
    channelAuthTenant: process.env.MicrosoftAppTenantId, // Tenant ID for authentication
    oAuthSettings: {
        appId: process.env.MicrosoftAppId, // OAuth App ID (same as Bot App ID)
        appPassword: process.env.MicrosoftAppPassword, // OAuth App Password (same as Bot App Password)
        tenantId: process.env.MicrosoftAppTenantId // Tenant ID for OAuth validation
    }
});


// Catch-all for errors.
const onTurnErrorHandler = async (context, error) => {
    // Log the error for debugging purposes
    console.error(`🔴 Authentication/Processing Error: ${error}`);
    
    // Check for specific error related to Azure Active Directory (AAD) authentication failure
    if (error.message.includes('AADSTS700016')) {
        // Handle specific Azure AD authentication error
        await context.sendActivity('⚠️ Authentication error with Azure AD. Please check your Bot Application configuration in the Azure Portal.');
        return;
    }

    // Generic error handling for other errors
    await context.sendActivity('❌ An error occurred while processing your request. Please try again later.');
};

// Set the onTurnError for the singleton BotFrameworkAdapter.
adapter.onTurnError = onTurnErrorHandler;

// Map configuration values values from .env file into the required format for each service.
const QnAConfiguration = {
    knowledgeBaseId: process.env.QnAKnowledgebaseId,
    endpointKey: process.env.QnAAuthKey,
    host: process.env.QnAEndpointHostName
};

const LuisConfiguration = {
    applicationId: process.env.LuisAppId,
    endpointKey: process.env.LuisAPIKey,
    endpoint: process.env.LuisAPIHostName,
}

const SchedulerConfiguration = {
    SchedulerEndpoint: process.env.SchedulerEndpoint
}
//pack each service configuration into 
const configuration = {
    QnAConfiguration,
    LuisConfiguration,
    SchedulerConfiguration
}

// Create the main dialog.
const myBot = new DentaBot(configuration, {});

// Listen for incoming requests.
server.post('/api/messages', (req, res) => {
    adapter.processActivity(req, res, async (context) => {
        // Route to main dialog.
        await myBot.run(context);
    });
});

// Listen for Upgrade requests for Streaming.
server.on('upgrade', (req, socket, head) => {
    // Create an adapter scoped to this WebSocket connection to allow storing session data.
    const streamingAdapter = new BotFrameworkAdapter({
        appId: process.env.MicrosoftAppId,
        appPassword: process.env.MicrosoftAppPassword
    });
    // Set onTurnError for the BotFrameworkAdapter created for each connection.
    streamingAdapter.onTurnError = onTurnErrorHandler;

    streamingAdapter.useWebSocket(req, socket, head, async (context) => {
        // After connecting via WebSocket, run this logic for every request sent over
        // the WebSocket connection.
        await myBot.run(context);
    });
});
