require('dotenv').config(); 
const mysql = require('mysql2/promise'); 
const fs = require('fs');
const { parse } = require('csv-parse');

async function importSuscribers() {
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

        const filePath = './suscriptores_nuevos.csv';
        const subscribers = [];

        const parser = fs
            .createReadStream(filePath)
            .pipe(parse({
                columns: true, 
                skip_empty_lines: true
            }));

        for await (const record of parser) {
            subscribers.push({
                nombre: record.nombre,
                email: record.email,
            });
        }

        console.log(`Leídos ${subscribers.length} suscriptores del CSV.`);

        for (const sub of subscribers) {
            const [rows] = await connection.execute(
                'SELECT id FROM suscriptores WHERE email = ?',
                [sub.email]
            );

            if (rows.length === 0) {
                const [result] = await connection.execute(
                    'INSERT INTO suscriptores (nombre, email) VALUES (?, ?)',
                    [sub.nombre, sub.email]
                );
                console.log(`Suscriptor '${sub.email}' insertado con ID: ${result.insertId}`);
            } else {
                console.log(`Suscriptor '${sub.email}' ya existe. Saltando inserción.`);
            }
        }

        console.log('Proceso de importación de suscriptores finalizado.');

    } catch (error) {
        console.error('Error durante la importación de suscriptores:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Conexión a la base de datos cerrada.');
        }
    }
}

importSuscribers();