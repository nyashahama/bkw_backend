const { Pool, Client } = require("pg");

const client = new Client({
  user: "postgres",
  password: "Gyver",
  host: "localhost",
  port: 5432,
});

const createDatabase = async () => {
  try {
    await client.connect();
    await client.query("CREATE DATABASE weeding_planner");
    console.log("Database created successfully");
  } catch (err) {
    if (err.code === "42P04") {
      console.log("Database already exists");
    } else {
      console.error("Error creating database:", err);
    }
  } finally {
    await client.end();
  }
};

const createTables = async (pool) => {
  try {
    // Create the 'users' table
    const createUsersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        contact_number VARCHAR(20),
        address TEXT,
        password TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'client'
      );
    `;
    await pool.query(createUsersTableQuery);

    // Create the 'services' table
    const createServicesTableQuery = `
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        user_id INTEGER NOT NULL,       
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createServicesTableQuery);

    // Create the 'subcategories' table
    const createSubcategoriesTableQuery = `
      CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        short_description TEXT NOT NULL,
        file_url VARCHAR(255)
      );
    `;
    await pool.query(createSubcategoriesTableQuery);

    // Create the 'appointments' table
    const createAppointmentsTableQuery = `
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        additional_info TEXT,
        client_id INTEGER NOT NULL,
        vendor_id INTEGER NOT NULL,
        status BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id),
        FOREIGN KEY (vendor_id) REFERENCES users(id)
      );
    `;
    await pool.query(createAppointmentsTableQuery);

    // Create the 'booking_status' enum type
    const createStatusEnumQuery = `
      DO $$ BEGIN
        CREATE TYPE booking_status AS ENUM ('in progress', 'confirmed', 'completed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    await pool.query(createStatusEnumQuery);

    // Create the 'bookings' table with status field using enum
    const createBookingsTableQuery = `
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        sub_id INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
        status booking_status DEFAULT 'in progress',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createBookingsTableQuery);

    // Create the 'payments' table with a reference to 'bookings'
    const createPaymentsTableQuery = `
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        deposit DECIMAL(10, 2) NOT NULL,
        reference_number VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createPaymentsTableQuery);
    console.log("Tables created successfully or already exist");

    // Create the 'wedding_plans' table
    const createWeddingPlansTableQuery = `
      CREATE TABLE IF NOT EXISTS wedding_plans (
        id SERIAL PRIMARY KEY,
        budget DECIMAL(10, 2),
        venue BOOLEAN DEFAULT FALSE,
        decor BOOLEAN DEFAULT FALSE,
        catering BOOLEAN DEFAULT FALSE,
        entertainment BOOLEAN DEFAULT FALSE,
        photographer BOOLEAN DEFAULT FALSE,
        wedding_cake BOOLEAN DEFAULT FALSE,
        transportation BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    await pool.query(createWeddingPlansTableQuery);
    console.log("Wedding Plans table created or already exists");
  } catch (err) {
    console.error("Error creating tables:", err);
  }
};

const initializeDatabase = async () => {
  await createDatabase();

  const pool = new Pool({
    user: "postgres",
    password: "Gyver",
    host: "localhost",
    port: 5432,
    database: "weeding_planner",
  });

  await createTables(pool);
  return pool;
};

module.exports = initializeDatabase;
