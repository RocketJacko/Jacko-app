import { MercadoPagoConfig, Preference } from 'mercadopago';

const MERCADOPAGO_ACCESS_TOKEN = "APP_USR-6424986371372164-053002-08f0437c4a97202cb44712d7f6a6ec02-3437325150";

async function run() {
  try {
    console.log("Configuring Mercado Pago...");
    const client = new MercadoPagoConfig({ accessToken: MERCADOPAGO_ACCESS_TOKEN.trim() });
    const preferenceInstance = new Preference(client);

    console.log("Creating preference...");
    const preference = await preferenceInstance.create({
      body: {
        items: [
          {
            id: "22222222-2222-2222-2222-222222222206",
            title: "Platzi pago unico",
            quantity: 1,
            unit_price: 140000,
            currency_id: "COP",
          }
        ],
        payer: {
          email: "jesus.carmona966@pascualbravo.edu.co",
        },
        back_urls: {
          success: "http://localhost:5173/?mercadopago_status=success",
          failure: "http://localhost:5173/?mercadopago_status=failure",
          pending: "http://localhost:5173/?mercadopago_status=pending",
        },
        // auto_return: "approved", // Desactivamos el auto_return para ver si acepta http://
        external_reference: "6349e871-c066-4f0e-91ad-35782a200fce",
        notification_url: "https://plybwnfnmvshroaottby.supabase.co/functions/v1/mercadopago-webhook"
      }
    });

    console.log("Success! Preference created:", JSON.stringify(preference, null, 2));
  } catch (error) {
    console.error("Error creating preference:", error);
    if (error.cause) {
      console.error("Error cause:", error.cause);
    }
  }
}

run();
