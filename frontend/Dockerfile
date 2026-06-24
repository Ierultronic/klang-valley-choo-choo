FROM node:20-alpine
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
WORKDIR /app
COPY frontend/package.json ./
RUN npm install --production=false
COPY frontend/ .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
