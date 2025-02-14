#!/bin/bash

# Step 1: SCP everything that isn't in .gitignore and .git to the remote server
rsync -avz --exclude-from='.gitignore' --exclude='.git' --include='.env' --delete ./ root@pvpvai.com:/root/pvpvai-backend/
(cd ../pvpvai-eliza-starter && rsync -avz --exclude-from='.gitignore' --exclude='.git' --include='.env'  --delete ./ root@pvpvai.com:/root/pvpvai-eliza)
scp .env root@pvpvai.com:/root/pvpvai-backend/.env
(cd ../pvpvai-eliza-starter && scp .env root@pvpvai.com:/root/pvpvai-eliza/.env)

#rsync -avz --exclude-from='.gitignore' --exclude='.git' --include='.envrc.prod' ./ root@88.99.99.179:/root/pvpvai-backend/
#(cd ../pvpvai-eliza && rsync -avz --exclude-from='.gitignore' --exclude='.git' --include='.env.prod' ./ root@88.99.99.179:/root/pvpvai-eliza/)

## Step 2: SSH into the remote server, navigate to the directory, rename .envrc.prod to .envrc and run the docker commands
ssh root@pvpvai.com << 'ENDSSH'
  cd /root/pvpvai-backend/
  docker image build -t pvpvai-backend .
  (cd ../pvpvai-eliza && docker image build -t pvpvai-eliza .)
  docker image build -t pvpvai-eliza .  
ENDSSH

# docker compose down
# docker compose up -d