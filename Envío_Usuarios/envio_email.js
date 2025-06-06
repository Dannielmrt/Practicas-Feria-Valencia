require('dotenv').config(); // Cargar variables de entorno
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const fs = require('fs');
const mjml = require('mjml').mjml2html;

async function sendNewsletter() {
    // --- 1. Configuración de la base de datos ---
    const dbConfig = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    };

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Conexión a la base de datos MySQL establecida correctamente.');

        // --- 2. Configuración de Nodemailer (tu servicio de email) ---
        // IMPORTANTE: Configura estas variables en tu archivo .env
        // Para Gmail:
        // EMAIL_SERVICE=Gmail
        // EMAIL_USER=tu_correo@gmail.com
        // EMAIL_PASSWORD=TU_CONTRASEÑA_DE_APLICACION_GMAIL

        // Para Outlook/Office365:
        // EMAIL_SERVICE=Outlook365
        // EMAIL_USER=tu_correo@tu_dominio.com
        // EMAIL_PASSWORD=TU_CONTRASEÑA_NORMAL
        // EMAIL_HOST=smtp.office365.com
        // EMAIL_PORT=587

        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE, // 'Gmail', 'Outlook365', etc.
            host: process.env.EMAIL_HOST,      // Solo para servicios que requieren host explícito (ej: smtp.office365.com)
            port: process.env.EMAIL_PORT,      // Solo para servicios que requieren puerto explícito (ej: 587)
            secure: process.env.EMAIL_PORT == 465 ? true : false, // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
        console.log('Transporte de Nodemailer configurado.');

        // --- 3. Obtener la plantilla MJML ---
        const mjmlTemplatePath = './Newsletter-Supuesto2.mjml';
        const mjmlTemplate = fs.readFileSync(mjmlTemplatePath, 'utf8');
        console.log('Plantilla MJML cargada.');

        // --- 4. Seleccionar una Campaña para enviar ---
        // Puedes cambiar el nombre de la campaña o el ID para elegir cuál enviar
        const [campaigns] = await connection.execute(
            'SELECT id, nombre, feria, edicion_anyo, descripcion, asunto_email FROM campanyas WHERE nombre = ? LIMIT 1',
            ['Supuesto 2'] // <-- Cambia esto al nombre de la campaña que quieras enviar
        );

        if (campaigns.length === 0) {
            console.error('Campaña no encontrada. Por favor, verifica el nombre de la campaña en la base de datos.');
            return;
        }
        const campaign = campaigns[0];
        console.log(`Campaña '${campaign.nombre}' seleccionada.`);

        // --- 5. Obtener suscriptores activos ---
        const [subscribers] = await connection.execute(
            'SELECT id, nombre, email FROM suscriptores'
            // Si tu tabla suscriptores tuviera 'activo': 'SELECT id, nombre, email FROM suscriptores WHERE activo = TRUE'
        );
        console.log(`Recuperados ${subscribers.length} suscriptores de la base de datos.`);

        // --- 6. Enviar correos a cada suscriptor ---
        for (const subscriber of subscribers) {
            // Reemplazar marcadores de posición en la plantilla MJML
            let personalizedMjml = mjmlTemplate
                .replace(/{{nombre}}/g, subscriber.nombre)
                .replace(/{{asunto_campanya}}/g, campaign.asunto_email) // Usamos el asunto de la campaña para el correo
                .replace(/{{feria_campanya}}/g, campaign.feria)
                .replace(/{{edicion_campanya}}/g, campaign.edicion_anyo);

            // Compilar MJML a HTML
            const { html } = mjml(personalizedMjml);

            const mailOptions = {
                from: process.env.EMAIL_USER, // Tu correo remitente
                to: subscriber.email,         // Correo del suscriptor
                subject: campaign.asunto_email, // Asunto del correo (usando el de la campaña)
                html: html,                   // Contenido HTML del correo
            };

            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`Correo enviado a ${subscriber.email}: ${info.messageId}`);

                // Registrar envío exitoso en la tabla 'envios'
                await connection.execute(
                    'INSERT INTO envios (id_suscriptor, id_campanya, fecha_envio, estado_envio, mensaje_id) VALUES (?, ?, NOW(), ?, ?)',
                    [subscriber.id, campaign.id, 'enviado', info.messageId]
                );
                console.log(`Registro de envío para ${subscriber.email} guardado.`);

            } catch (error) {
                console.error(`Error al enviar correo a ${subscriber.email}:`, error);

                // Registrar envío fallido en la tabla 'envios'
                await connection.execute(
                    'INSERT INTO envios (id_suscriptor, id_campanya, fecha_envio, estado_envio, mensaje_id) VALUES (?, ?, NOW(), ?, ?)',
                    [subscriber.id, campaign.id, 'fallido', error.message] // Guardar el mensaje de error
                );
                console.log(`Registro de envío fallido para ${subscriber.email} guardado.`);
            }
        }

        console.log('Proceso de envío de newsletters finalizado.');

    } catch (error) {
        console.error('Error general en el proceso de envío:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Conexión a la base de datos cerrada.');
        }
    }
}

sendNewsletter();