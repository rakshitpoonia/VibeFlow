/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      "lh3.googleusercontent.com", // Google avatar urls
      "avatars.githubusercontent.com", // GitHub profile images
      "avatars2.githubusercontent.com", // GitHub profile images
      // …any other external hosts you use
    ],
  },
};

module.exports = nextConfig;
