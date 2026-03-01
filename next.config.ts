/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // to allow google/github auth profile picture to be displayed without any issues
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

module.exports = nextConfig;
