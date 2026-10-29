from dotenv import load_dotenv
import os
load_dotenv()

SERVER_URL = 'localhost'
PORT = '8900'
ENV = 'dev'

# No external API key is required for the local math parser fallback.