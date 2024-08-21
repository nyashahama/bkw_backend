const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const initializeDatabase = require("./database");

const app = express();

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

initializeDatabase()
  .then((pool) => {
    //add user
    app.post("/adduser", async (req, res) => {
      const { email, full_name, contact_number, address, password } = req.body;
      if (!email || !full_name || !password) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
          "INSERT INTO users (email, full_name, contact_number, address, password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [email, full_name, contact_number, address, hashedPassword]
        );
        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error("Error adding user:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get a user by ID
    app.get("/users/:id", async (req, res) => {
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      try {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [
          userId,
        ]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "User not found" });
        }
        res.status(200).json(result.rows[0]);
      } catch (err) {
        console.error("Error retrieving user:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Login
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Missing email or password" });
      }
      try {
        const result = await pool.query(
          "SELECT * FROM users WHERE email = $1",
          [email]
        );
        if (result.rows.length === 0) {
          return res.status(401).json({ error: "Invalid email or password" });
        }
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({ error: "Invalid email or password" });
        }
        res.status(200).json({ message: "Login successful", user });
      } catch (err) {
        console.error("Error during login:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Add service
    app.post("/addservice", async (req, res) => {
      const { title, description, subcategories, userId } = req.body;
      if (!title || !description || !userId || !subcategories) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      let parsedSubcategories;
      try {
        parsedSubcategories = JSON.parse(subcategories);
      } catch (err) {
        return res.status(400).json({ error: "Invalid subcategories format" });
      }
      if (!Array.isArray(parsedSubcategories)) {
        return res
          .status(400)
          .json({ error: "Subcategories must be an array" });
      }
      try {
        const result = await pool.query(
          "INSERT INTO services (title, description, user_id) VALUES ($1, $2, $3) RETURNING *",
          [title, description, userId]
        );
        const serviceId = result.rows[0].id;
        const subcategoryQueries = parsedSubcategories.map((sub) => {
          return pool.query(
            "INSERT INTO subcategories (service_id, name, price, short_description, file_url) VALUES ($1, $2, $3, $4, $5)",
            [serviceId, sub.name, sub.price, sub.shortDescription, sub.file]
          );
        });
        await Promise.all(subcategoryQueries);
        res.status(201).json({
          message: "Service and subcategories added successfully",
          serviceId,
        });
      } catch (err) {
        console.error("Error adding service and subcategories:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Fetch all services
    app.get("/services", async (req, res) => {
      try {
        const servicesResult = await pool.query("SELECT * FROM services");

        const services = servicesResult.rows;

        const subcategoryPromises = services.map(async (service) => {
          const subcategoriesResult = await pool.query(
            "SELECT * FROM subcategories WHERE service_id = $1",
            [service.id]
          );
          return {
            ...service,
            subcategories: subcategoriesResult.rows,
          };
        });

        const servicesWithSubcategories = await Promise.all(
          subcategoryPromises
        );

        res.status(200).json(servicesWithSubcategories);
      } catch (err) {
        console.error("Error fetching services:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    //fetch service by user_id
    app.get("/services/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        const servicesResult = await pool.query(
          "SELECT * FROM services WHERE user_id = $1",
          [userId]
        );

        const services = servicesResult.rows;
        const subcategoryPromises = services.map(async (service) => {
          const subcategoriesResult = await pool.query(
            "SELECT * FROM subcategories WHERE service_id = $1",
            [service.id]
          );
          return {
            ...service,
            subcategories: subcategoriesResult.rows,
          };
        });
        const servicesWithSubcategories = await Promise.all(
          subcategoryPromises
        );
        res.status(200).json(servicesWithSubcategories);
      } catch (err) {
        console.error("Error fetching services by user ID:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Post a new appointment
    app.post("/appointments", async (req, res) => {
      const { date, time, additional_info, client_id, vendor_id, status } =
        req.body;

      if (!date || !time || !client_id || !vendor_id) {
        return res.status(400).json({
          error: "date, time, client_id, and vendor_id are required",
        });
      }

      try {
        const insertAppointmentQuery = `
      INSERT INTO appointments (date, time, additional_info, client_id, vendor_id, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

        const values = [
          date,
          time,
          additional_info,
          client_id,
          vendor_id,
          status || null,
        ];
        const result = await pool.query(insertAppointmentQuery, values);
        res.status(201).json(result.rows[0]);
      } catch (error) {
        console.error("Error creating appointment:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // fetch apooitment by clinet id
    app.get("/appointments/client/:clientId", async (req, res) => {
      const { clientId } = req.params;

      try {
        const fetchAppointmentsQuery = `
      SELECT * FROM appointments WHERE client_id = $1;
    `;
        const result = await pool.query(fetchAppointmentsQuery, [clientId]);
        res.status(200).json(result.rows);
      } catch (error) {
        console.error("Error fetching appointments by client_id:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    //fetch appoitnment by vendor id
    app.get("/appointments/vendor/:vendorId", async (req, res) => {
      const { vendorId } = req.params;

      try {
        const fetchAppointmentsQuery = `
      SELECT * FROM appointments WHERE vendor_id = $1;
    `;
        const result = await pool.query(fetchAppointmentsQuery, [vendorId]);
        res.status(200).json(result.rows);
      } catch (error) {
        console.error("Error fetching appointments by vendor_id:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    //update appoitnment by id
    app.patch("/appointments/:appointmentId/status", async (req, res) => {
      const { appointmentId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      try {
        const updateStatusQuery = `
      UPDATE appointments
      SET status = $1
      WHERE id = $2
      RETURNING *;
    `;
        const result = await pool.query(updateStatusQuery, [
          status,
          appointmentId,
        ]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Appointment not found" });
        }
        res.status(200).json(result.rows[0]);
      } catch (error) {
        console.error("Error updating appointment status:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    //delete by appoitnment id
    app.delete("/appointments/:appointmentId", async (req, res) => {
      const { appointmentId } = req.params;

      try {
        const deleteAppointmentQuery = `
      DELETE FROM appointments
      WHERE id = $1
      RETURNING *;
    `;
        const result = await pool.query(deleteAppointmentQuery, [
          appointmentId,
        ]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Appointment not found" });
        }
        res.status(200).json({ message: "Appointment deleted successfully" });
      } catch (error) {
        console.error("Error deleting appointment:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    //fetch all appoitnments
    app.get("/appointments", async (req, res) => {
      try {
        const fetchAllAppointmentsQuery = `
      SELECT * FROM appointments;
    `;
        const result = await pool.query(fetchAllAppointmentsQuery);
        res.status(200).json(result.rows);
      } catch (error) {
        console.error("Error fetching all appointments:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Add booking
    app.post("/addbooking", async (req, res) => {
      const { service_id, user_id, sub_id } = req.body;

      if (!service_id || !user_id || !sub_id) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      try {
        const result = await pool.query(
          "INSERT INTO bookings (service_id, user_id, sub_id) VALUES ($1, $2, $3) RETURNING *",
          [service_id, user_id, sub_id]
        );

        res.status(201).json({
          message: "Booking added successfully",
          booking: result.rows[0],
        });
      } catch (err) {
        console.error("Error adding booking:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    //get bookings by id
    app.get("/bookings/:user_id", async (req, res) => {
      const { user_id } = req.params;

      try {
        // Fetch bookings for the user
        const bookingsResult = await pool.query(
          "SELECT * FROM bookings WHERE user_id = $1",
          [user_id]
        );

        if (bookingsResult.rows.length === 0) {
          console.warn(`No bookings found for user_id: ${user_id}`);
          return res
            .status(404)
            .json({ error: "No bookings found for this user" });
        }

        const bookings = [];

        for (const booking of bookingsResult.rows) {
          const { id: booking_id, service_id, sub_id } = booking;

          // Fetch service details
          const serviceResult = await pool.query(
            "SELECT * FROM services WHERE id = $1",
            [service_id]
          );

          if (serviceResult.rows.length === 0) {
            console.warn(`Service not found for service_id: ${service_id}`);
            bookings.push({
              ...booking,
              service: null,
              subcategory: null,
              payment: null,
            });
            continue;
          }

          const service = serviceResult.rows[0];

          // Fetch subcategory details using sub_id from the booking
          const subcategoryResult = await pool.query(
            "SELECT * FROM subcategories WHERE id = $1",
            [sub_id]
          );

          if (subcategoryResult.rows.length === 0) {
            console.warn(`Subcategory not found for sub_id: ${sub_id}`);
          }

          // Fetch payment details related to the booking
          const paymentResult = await pool.query(
            "SELECT * FROM payments WHERE booking_id = $1",
            [booking_id]
          );

          if (paymentResult.rows.length === 0) {
            console.warn(`No payment found for booking_id: ${booking_id}`);
          }

          const subcategory =
            subcategoryResult.rows.length > 0
              ? subcategoryResult.rows[0]
              : null;
          const payment =
            paymentResult.rows.length > 0 ? paymentResult.rows[0] : null;

          bookings.push({
            ...booking,
            service,
            subcategory,
            payment,
          });
        }

        res.status(200).json(bookings);
      } catch (err) {
        console.error("Error fetching bookings:", err.message, err.stack);
        res
          .status(500)
          .json({ error: "Internal server error", details: err.message });
      }
    });

    // Define the route to fetch bookings by userId
    app.get("/vendor_bookings/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        // Step 1: Fetch service IDs for the given user
        const servicesResult = await pool.query(
          "SELECT id FROM services WHERE user_id = $1",
          [userId]
        );

        const serviceIds = servicesResult.rows.map((service) => service.id);

        if (serviceIds.length === 0) {
          return res
            .status(404)
            .json({ message: "No services found for the given userId" });
        }

        // Step 2: Fetch bookings for the service IDs
        const bookingsResult = await pool.query(
          "SELECT DISTINCT service_id FROM bookings WHERE service_id = ANY($1::int[])",
          [serviceIds]
        );

        const bookingServiceIds = bookingsResult.rows.map(
          (booking) => booking.service_id
        );

        if (bookingServiceIds.length === 0) {
          return res.status(404).json({
            message: "No bookings found for the services of the given userId",
          });
        }

        // Step 3: Fetch service details
        const filteredServicesResult = await pool.query(
          "SELECT * FROM services WHERE id = ANY($1::int[])",
          [bookingServiceIds]
        );

        const filteredServices = filteredServicesResult.rows;

        // Step 4: Fetch bookings for the filtered services
        const bookingsResultForFilteredServices = await pool.query(
          "SELECT * FROM bookings WHERE service_id = ANY($1::int[])",
          [bookingServiceIds]
        );

        const bookings = bookingsResultForFilteredServices.rows;

        // Step 5: Fetch subcategories and users details
        const subIds = [...new Set(bookings.map((booking) => booking.sub_id))];
        const subcategoriesResult = await pool.query(
          "SELECT * FROM subcategories WHERE id = ANY($1::int[])",
          [subIds]
        );

        const subcategories = subcategoriesResult.rows;
        const userIds = [
          ...new Set(bookings.map((booking) => booking.user_id)),
        ];
        const usersResult = await pool.query(
          "SELECT * FROM users WHERE id = ANY($1::int[])",
          [userIds]
        );

        const users = usersResult.rows;

        const servicesWithDetails = filteredServices.map((service) => {
          const serviceBookings = bookings.filter(
            (booking) => booking.service_id === service.id
          );

          const bookingsWithDetails = serviceBookings.map((booking) => {
            const subcategory =
              subcategories.find((sub) => sub.id === booking.sub_id) || {};

            const user =
              users.find((user) => user.id === booking.user_id) || {};

            return {
              ...booking,
              subcategory,
              user,
            };
          });

          return {
            ...service,
            bookings: bookingsWithDetails,
          };
        });

        // Return the services with their associated bookings, subcategories, and users
        res.status(200).json(servicesWithDetails);
      } catch (err) {
        console.error("Error fetching bookings by user ID:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Post a new payment
    app.post("/payments", async (req, res) => {
      const { booking_id, deposit, reference_number } = req.body;

      // Validate required fields
      if (!booking_id || !deposit || !reference_number) {
        return res.status(400).json({
          error: "booking_id, deposit, and reference_number are required",
        });
      }

      try {
        const insertPaymentQuery = `
      INSERT INTO payments (booking_id, deposit, reference_number)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

        const values = [booking_id, deposit, reference_number];
        const result = await pool.query(insertPaymentQuery, values);
        res.status(201).json(result.rows[0]);
      } catch (error) {
        console.error("Error creating payment:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Post a new wedding plan
    app.post("/wedding_plans", async (req, res) => {
      const {
        budget,
        venue,
        decor,
        catering,
        entertainment,
        photographer,
        wedding_cake,
        transportation,
        user_id,
      } = req.body;

      // Validate required fields
      if (!user_id) {
        return res.status(400).json({ error: "user_id are required" });
      }

      try {
        const insertPlanQuery = `
      INSERT INTO wedding_plans (budget, venue, decor, catering, entertainment, photographer, wedding_cake, transportation, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

        const result = await pool.query(insertPlanQuery, [
          budget || null,
          venue || false,
          decor || false,
          catering || false,
          entertainment || false,
          photographer || false,
          wedding_cake || false,
          transportation || false,
          user_id,
        ]);

        const newPlan = result.rows[0];

        res.status(201).json({
          message: "Wedding plan created successfully",
          plan: newPlan,
        });
      } catch (err) {
        console.error("Error creating wedding plan:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Fetch all wedding plans by user_id
    app.get("/wedding_plans/:user_id", async (req, res) => {
      const { user_id } = req.params;
      try {
        const plansResult = await pool.query(
          "SELECT * FROM wedding_plans WHERE user_id = $1",
          [user_id]
        );

        if (plansResult.rows.length === 0) {
          return res
            .status(404)
            .json({ error: "No plans found for this user" });
        }

        res.status(200).json(plansResult.rows);
      } catch (err) {
        console.error("Error fetching wedding plans:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
  });
