#!/usr/bin/env node

/**
 * Script to set a user as platform admin
 * Usage: node set-platform-admin.js <user-id>
 */

require('dotenv').config({ path: './server/.env' });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://edsyhtlaqwiicxlzorca.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_KEY environment variable not set");
  console.error("Make sure you have a .env file in the server/ directory");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const userId = process.argv[2] || "5a055f52-9ff8-49d3-9583-9903d5350c3e";

async function setAdmin() {
  try {
    console.log(`Setting user ${userId} as platform admin...`);

    // First, check if profile exists
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching profile:", fetchError);
      process.exit(1);
    }

    if (!profile) {
      console.log(`Profile not found for user ${userId}. Creating one...`);
      const { data: created, error: createError } = await supabaseAdmin
        .from("profiles")
        .insert([{ id: userId, global_role: "platform_admin" }])
        .select();

      if (createError) {
        console.error("Error creating profile:", createError);
        process.exit(1);
      }

      console.log("✅ Profile created with platform_admin role");
      console.log(created);
    } else {
      console.log(`Found profile:`, profile);
      console.log(`Current global_role: ${profile.global_role}`);

      // Update the role
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ global_role: "platform_admin" })
        .eq("id", userId)
        .select();

      if (updateError) {
        console.error("Error updating profile:", updateError);
        process.exit(1);
      }

      console.log("✅ User set as platform admin");
      console.log(updated);
    }

    // Verify
    const { data: verified, error: verifyError } = await supabaseAdmin
      .from("profiles")
      .select("global_role")
      .eq("id", userId)
      .maybeSingle();

    if (verifyError) {
      console.error("Error verifying:", verifyError);
      process.exit(1);
    }

    console.log(`✅ Verified: global_role = ${verified.global_role}`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

setAdmin();
