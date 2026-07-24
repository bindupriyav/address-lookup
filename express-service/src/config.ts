export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  uspsApiKey: process.env.USPS_API_KEY || 'mock',
};
