const { ActivityHandler, MessageFactory } = require('botbuilder');
const axios = require('axios');

class DentaBot extends ActivityHandler {
    constructor(configuration) {
        super();
        
        // Initialize configuration
        this.initializeConfig();
        
        // Initialize metrics collector
        this.initializeMetrics();
        
        // Register event handlers
        this.registerHandlers();
    }

    /**
     * Initialize configuration from environment variables
     */
    initializeConfig() {
        this.endpoint = process.env.AZURE_LANGUAGE_ENDPOINT;
        this.apiKey = process.env.AZURE_LANGUAGE_KEY;
        
        // QnA Configuration
        this.qnaConfig = {
            projectName: process.env.QNA_PROJECT_NAME,
            deploymentName: process.env.QNA_DEPLOYMENT_NAME
        };
        
        // CLU Configuration
        this.cluConfig = {
            projectName: process.env.CLU_PROJECT_NAME,
            deploymentName: process.env.CLU_DEPLOYMENT_NAME
        };

        // Scheduler API Configuration
        this.schedulerConfig = {
            endpoint: process.env.SCHEDULER_API_ENDPOINT || 'http://localhost:3000'
        };
    }

    /**
     * Initialize metrics collector for tracking usage
     */
    initializeMetrics() {
        this.metrics = {
            requests: 0,
            intents: {},
            qnaQueries: 0,
            errors: 0,
            startTime: Date.now()
        };
    }

    /**
     * Register handlers for different events (e.g., message, members added)
     */
    registerHandlers() {
        this.onMessage(async (context, next) => {
            console.log('📨 Received message:', context.activity.text);
            const start = Date.now();

            try {
                await this.handleMessage(context);
                this.metrics.requests++;
            } catch (error) {
                await this.handleError(context, error);
                this.metrics.errors++;
            } finally {
                console.log(`⚡ Processing time: ${Date.now() - start}ms`);
            }

            await next();
        });

        this.onMembersAdded(async (context, next) => {
            await this.handleWelcome(context);
            await next();
        });
    }

    /**
     * Handle incoming message and perform necessary actions
     */
    async handleMessage(context) {
        const prediction = await this.analyzeCLU(context.activity.text);
        
        if (prediction) {
            console.log(`🔍 Intent: ${prediction.topIntent} (${prediction.confidenceScore})`);
    
            if (prediction.confidenceScore > 0.7) {
                await this.processIntent(context, prediction);
                return;
            }
        }
        
        await this.handleQnA(context);
    }
    

    /**
     * Analyze the user's input to determine intent using CLU
     */
    async analyzeCLU(text) {
        try {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const response = await axios.post(
                `${this.endpoint}/language/:analyze-conversations?api-version=2022-10-01-preview`,
                {
                    kind: "Conversation",
                    analysisInput: {
                        conversationItem: {
                            id: requestId,
                            text: text,
                            modality: "text",
                            language: "en",
                            participantId: "user1"
                        }
                    },
                    parameters: {
                        projectName: this.cluConfig.projectName,
                        deploymentName: this.cluConfig.deploymentName,
                        stringIndexType: "TextElement_V8",
                        verbose: true
                    }
                },
                {
                    headers: {
                        'Ocp-Apim-Subscription-Key': this.apiKey,
                        'Apim-Request-Id': requestId,
                        'Content-Type': 'application/json'
                    }
                }
            );
    
            console.log('🟢 CLU Response Structure:', JSON.stringify(response.data, null, 2));
    
            const prediction = response.data?.result?.prediction;
            if (!prediction) {
                console.warn('⚠️ Không tìm thấy prediction trong response');
                return null;
            }
    
            const topIntent = prediction.topIntent;
            // Tìm intent score từ mảng intents
            const intentScore = prediction.intents?.find(
                intent => intent.category === topIntent
            )?.confidenceScore;
    
            const standardizedPrediction = {
                topIntent,
                confidenceScore: intentScore,
                entities: prediction.entities || [],
                raw: prediction 
            };
    
            console.log('🎯 Standardized Prediction:', standardizedPrediction);
    
            return standardizedPrediction;
        } catch (error) {
            console.error('🔴 CLU Analysis Error:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            return null;
        }
    }

    /**
     * Process different intents based on the CLU prediction
     */
    async processIntent(context, prediction) {
        switch (prediction.topIntent) {
            case 'GetAvailability':
                await this.handleAvailability(context);
                break;
            case 'ScheduleAppointment':
                await this.handleScheduling(context, prediction.entities);
                break;
            case 'CancelAppointment':
                await this.handleCancellation(context, prediction.entities);
                break;
            case 'ServiceInquiry':
                await this.handleServiceInquiry(context);
                break;
            case 'CostInquiry':
                await this.handleCostInquiry(context, prediction.entities);
                break;
            case 'InsuranceInquiry':
                await this.handleInsuranceInquiry(context);
                break;
            default:
                await this.handleQnA(context);
        }
    }

    /**
     * Handle QnA queries when the intent is not clear
     */
    async handleQnA(context) {
        try {
            console.log('🔄 Forwarding to QnA service...');
            const response = await axios.post(
                `${this.endpoint}language/:query-knowledgebases?projectName=${this.qnaConfig.projectName}&api-version=2021-10-01&deploymentName=${this.qnaConfig.deploymentName}`,
                {
                    top: 1,
                    question: context.activity.text,
                    includeUnstructuredSources: true
                },
                {
                    headers: {
                        'Ocp-Apim-Subscription-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            this.metrics.qnaQueries++;

            if (response.data?.answers?.length > 0) {
                await context.sendActivity(response.data.answers[0].answer);
            } else {
                await context.sendActivity('Sorry, I could not find relevant information.');
            }
        } catch (error) {
            console.error('🔴 QnA Error:', error);
            throw error;
        }
    }

    // Handlers for specific intents
    async handleAvailability(context) {
        try {
            console.log('🔄 Kiểm tra các slot trống...');
            const response = await axios.get(`${this.schedulerConfig.endpoint}/api/availability`);
            
            // Trích xuất mảng available_slots từ response
            const { date, available_slots } = response.data;
            
            // Format thông báo với ngày và các slot
            const message = [
                `📅 Các slot trống cho ngày ${date}:`,
                ...available_slots.map(slot => `⏰ ${slot}`)
            ].join('\n');
            
            await context.sendActivity(message);
            
            // Log for debugging
            console.log('✅ Đã xử lý availability:', {
                date,
                slotsCount: available_slots.length
            });
        } catch (error) {
            console.error('❌ Lỗi khi kiểm tra availability:', error);
            await context.sendActivity('Không thể kiểm tra các slot trống. Vui lòng thử lại sau.');
        }
    }
    

    // Handle appointment scheduling
    async handleScheduling(context, entities) {
        try {
            console.log('🔄 Handling scheduling request with entities:', entities);

            // Extract datetime from entities
            const datetime = entities?.find(e => e.category === 'DateTime')?.text;
            if (!datetime) {
                await context.sendActivity('⚠️ Please provide a time for the appointment.');
                return;
            }

            // Call scheduling API
            const response = await axios.post(`${this.schedulerConfig.endpoint}/api/appointments`, {
                datetime: datetime
            });

            // Format confirmation message
            const appointment = response.data;
            const confirmMessage = [
                `✅ Appointment scheduled successfully!`,
                `📅 Date: ${appointment.date}`,
                `⏰ Time: ${appointment.time}`,
                `👤 Patient Name: ${appointment.patientName}`,
                `🏥 Service ID: ${appointment.serviceId}`,
                `📋 Status: ${appointment.status}`
            ].join('\n');

            console.log('✅ Appointment scheduled:', appointment);
            await context.sendActivity(confirmMessage);
        } catch (error) {
            console.error('❌ Error scheduling appointment:', error);
            await context.sendActivity('Unable to schedule appointment. Please try again later.');
        }
    }

    // Handle appointment cancellation
    async handleCancellation(context, entities) {
        try {
            // Extract appointment ID from entities (default to '123' if not found)
            const appointmentId = entities?.find(e => e.category === 'AppointmentId')?.text || '123';
            
            console.log('🗑️ Cancelling appointment with ID:', appointmentId);

            // Call the cancel appointment API
            const response = await axios.delete(
                `${this.schedulerConfig.endpoint}/api/appointments/${appointmentId}`
            );

            console.log('✅ Appointment cancellation response:', response.data);
            await context.sendActivity(`✅ ${response.data.message} (ID: ${appointmentId})`);
        } catch (error) {
            console.error('❌ Error canceling appointment:', error);
            await context.sendActivity('Unable to cancel the appointment. Please try again later.');
        }
    }

    // Handle service inquiry
    async handleServiceInquiry(context) {
        try {
            console.log('📋 Retrieving service list...');
            
            // Fetch services list from the API
            const response = await axios.get(`${this.schedulerConfig.endpoint}/api/services`);
            
            const services = response.data;
            const serviceList = [
                '📋 List of our services:',
                ...services.map(service => 
                    `🔹 ${service.name}: ${service.duration} minutes - $${service.price}`
                )
            ].join('\n');

            console.log('📋 Service list retrieved:', serviceList);
            await context.sendActivity(serviceList);
        } catch (error) {
            console.error('❌ Error retrieving services:', error);
            await context.sendActivity('Unable to retrieve service information. Please try again later.');
        }
    }

    // Handle cost inquiry
    async handleCostInquiry(context, entities) {
        try {
            // Extract service ID from entities (default to '1' if not found)
            const serviceId = entities?.find(e => e.category === 'ServiceId')?.text || '1';
            
            console.log('💰 Retrieving price for service ID:', serviceId);

            // Fetch price for a specific service
            const response = await axios.get(
                `${this.schedulerConfig.endpoint}/api/services/${serviceId}/price`
            );
            
            const priceInfo = response.data;
            console.log('💰 Price info retrieved:', priceInfo);
            await context.sendActivity(
                `💰 Service ${priceInfo.service}: $${priceInfo.price} ${priceInfo.currency}`
            );
        } catch (error) {
            console.error('❌ Error retrieving cost information:', error);
            await context.sendActivity('Unable to retrieve cost information. Please try again later.');
        }
    }

    // Handle insurance inquiry
    async handleInsuranceInquiry(context) {
        try {
            console.log('📄 Retrieving insurance provider list...');
            
            // Fetch list of insurance providers
            const response = await axios.get(`${this.schedulerConfig.endpoint}/api/insurance`);
            
            const insuranceList = [
                '📄 List of accepted insurance providers:',
                ...response.data.map(insurance => 
                    `🔹 ${insurance.name}: Coverage ${insurance.coverage}`
                )
            ].join('\n');

            console.log('📄 Insurance list retrieved:', insuranceList);
            await context.sendActivity(insuranceList);
        } catch (error) {
            console.error('❌ Error retrieving insurance information:', error);
            await context.sendActivity('Unable to retrieve insurance information. Please try again later.');
        }
    }

    /**
     * Send a welcome message when a user joins
     */
    async handleWelcome(context) {
        const welcomeText = `👋 Welcome to Dental Assistant!

I can help you with:
📋 Answering service-related questions
🕒 Checking available appointment slots
📅 Scheduling an appointment
💰 Retrieving cost information
📄 Insurance inquiries

How can I assist you today?`;

        for (const member of context.activity.membersAdded) {
            if (member.id !== context.activity.recipient.id) {
                await context.sendActivity(MessageFactory.text(welcomeText));
            }
        }
    }
}

module.exports.DentaBot = DentaBot;
