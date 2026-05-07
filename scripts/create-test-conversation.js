/**
 * Script de prueba para crear conversación de chat
 * Ejecutar: node scripts/create-test-conversation.js
 * 
 * Este script crea una conversación directa entre dos usuarios para pruebas
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Usuario = require('../models/Usuario');

async function createTestConversation() {
    try {
        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB');

        // Buscar usuarios activos (no eliminados)
        const users = await Usuario.find({
            isDeleted: { $ne: true }
        }).limit(5);

        console.log(`🔍 Usuarios encontrados: ${users.length}`);
        
        if (users.length < 2) {
            console.log('❌ Se necesitan al menos 2 usuarios para crear una conversación');
            console.log('ℹ️ Crea más usuarios desde la app: Configuración > Usuarios');
            process.exit(1);
        }
        
        // Mostrar usuarios encontrados
        users.forEach((u, i) => {
            console.log(`   ${i+1}. ${u.username} (ID: ${u._id}, Empresa: ${u.empresaId})`);
        });

        const user1 = users[0];
        const user2 = users[1];

        console.log(`👤 Usuario 1: ${user1.username} (${user1._id})`);
        console.log(`👤 Usuario 2: ${user2.username} (${user2._id})`);

        // Verificar si ya existe conversación entre ellos
        const existingConv = await Conversation.findOne({
            empresaId: user1.empresaId,
            type: 'direct',
            'participants.userId': { $all: [user1._id, user2._id] }
        });

        if (existingConv) {
            console.log('ℹ️ Ya existe una conversación entre estos usuarios:');
            console.log(`   ID: ${existingConv._id}`);
            process.exit(0);
        }

        // Crear conversación
        const conversation = new Conversation({
            empresaId: user1.empresaId,
            type: 'direct',
            title: `Chat: ${user1.username} ↔ ${user2.username}`,
            participants: [
                {
                    userId: user1._id,
                    role: 'member',
                    unreadCount: 0,
                    joinedAt: new Date()
                },
                {
                    userId: user2._id,
                    role: 'member',
                    unreadCount: 1,
                    joinedAt: new Date()
                }
            ],
            lastMessage: {
                content: '👋 ¡Conversación creada!',
                senderId: user1._id,
                senderName: 'Sistema',
                sentAt: new Date()
            }
        });

        await conversation.save();
        console.log('✅ Conversación creada:', conversation._id);

        // Crear mensaje de sistema (usar user1 como sender para cumplir validación)
        const message = new Message({
            empresaId: user1.empresaId,
            conversationId: conversation._id,
            senderId: user1._id,
            senderName: 'Sistema',
            content: '👋 ¡Conversación creada para pruebas!',
            type: 'system',
            isSystemMessage: true
        });

        await message.save();
        console.log('✅ Mensaje inicial creado');

        console.log('\n🎉 LISTO! Conversación de prueba creada');
        console.log(`📋 ID de conversación: ${conversation._id}`);
        console.log(`📋 Participantes: ${user1.username}, ${user2.username}`);
        console.log('\n👉 Abre el widget de chat en la app para ver la conversación');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

createTestConversation();
