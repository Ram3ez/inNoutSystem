import {
  Client,
  Account,
  Databases,
  Storage,
  ID,
  OAuthProvider,
  Teams,
  Query,
} from "appwrite";

const client = new Client();

client
  .setEndpoint("https://hostel.ram3ez.dev/v1")
  .setProject("6991740c001012a4a46f");

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const teams = new Teams(client);
export { client, ID, OAuthProvider, Query };
