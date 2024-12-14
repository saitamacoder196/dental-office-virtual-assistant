// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const path = require('path');
const express = require('express');

// Import required bot configuration
const dotenv = require('dotenv');
const ENV_FILE = path.join(__dirname, '.env');
dotenv.config({ path: ENV_FILE });

// Import required bot services
const { BotFrameworkAdapter } = require('botbuilder');
const { DentaBot } = require('./bot');

// Create Express server
const app = express();
app.use(express.json());

// Create adapter
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    channelAuthTenant: process.env.MicrosoftAppTenantId,
    oAuthSettings: {
        appId: process.env.MicrosoftAppId,
        appPassword: process.env.MicrosoftAppPassword,
        tenantId: process.env.MicrosoftAppTenantId
    }
});

// Catch-all for errors
const onTurnErrorHandler = async (context, error) => {
    // Log the error for debugging purposes
    console.error(`🔴 Authentication/Processing Error: ${error}`);
    
    // Handle AAD authentication errors
    if (error.message.includes('AADSTS700016')) {
        await context.sendActivity('⚠️ Authentication error with Azure AD. Please check your Bot Application configuration.');
        return;
    }

    await context.sendActivity('❌ An error occurred while processing your request. Please try again later.');
};

// Set the onTurnError for the singleton BotFrameworkAdapter
adapter.onTurnError = onTurnErrorHandler;

// Map configuration values from .env file
const configuration = {
    QnAConfiguration: {
        knowledgeBaseId: process.env.QnAKnowledgebaseId,
        endpointKey: process.env.QnAAuthKey,
        host: process.env.QnAEndpointHostName
    },
    LuisConfiguration: {
        applicationId: process.env.LuisAppId,
        endpointKey: process.env.LuisAPIKey,
        endpoint: process.env.LuisAPIHostName,
    },
    SchedulerConfiguration: {
        SchedulerEndpoint: process.env.SchedulerEndpoint
    }
};

// Create the main bot instance
const myBot = new DentaBot(configuration, {});

// Listen for incoming requests
app.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, async (context) => {
        await myBot.run(context);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        version: process.version,
        botStatus: 'running',
        timestamp: new Date().toISOString()
    });
});

// WebSocket upgrade handling
const expressWs = require('express-ws')(app);
app.ws('/api/messages', (ws, req) => {
    const streamingAdapter = new BotFrameworkAdapter({
        appId: process.env.MicrosoftAppId,
        appPassword: process.env.MicrosoftAppPassword
    });
    
    streamingAdapter.onTurnError = onTurnErrorHandler;

    ws.on('message', async (msg) => {
        try {
            const context = await streamingAdapter.createContext(msg);
            await myBot.run(context);
        } catch (error) {
            console.error('WebSocket message processing error:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Error processing message'
            }));
        }
    });
});

// Start server
const port = process.env.port || process.env.PORT || 3978;
app.listen(port, () => {
    console.log(`\n🤖 Bot is running on port ${port}`);
    console.log(`🔍 Health check: http://localhost:${port}/health`);
    console.log(`💻 Node version: ${process.version}`);
    console.log(`\n💡 Get Bot Framework Emulator: https://aka.ms/botframework-emulator`);
    console.log(`\n🚀 To talk to your bot, open the emulator and select "Open Bot"\n`);
});

// Global error handling
process.on('uncaughtException', (error) => {
    console.error('🔴 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔴 Unhandled Rejection:', reason);
});