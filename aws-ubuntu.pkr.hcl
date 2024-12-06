packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.8"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "ubuntu" {
  ami_name      = "packer-linux-aws-final1"
  instance_type = "t2.micro"
  region        = "us-west-2"
  source_ami_filter {
    filters = {
      "name" : "ubuntu-pro-server*20.04-amd64*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"]
  }
  ssh_username = "ubuntu"
}

build {
  name = "packer-build"
  sources = [
    "source.amazon-ebs.ubuntu"
  ]

  # Initial system updates and installations
  provisioner "shell" {
    inline_shebang = "/bin/bash"
    inline = [
      "export DEBIAN_FRONTEND=noninteractive",
      "sudo apt-get update -y",
      "sudo apt-get upgrade -y",
      "sudo apt-get clean",
      "sudo apt-get install -y curl unzip awscli wget snapd",

      # Remove any existing Node.js installations
      "sudo apt-get remove -y nodejs npm",
      "sudo apt-get autoremove -y",

      # Install Node.js 18.x using NodeSource
      "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -",
      "sudo apt-get update -y",
      "sudo apt-get install -y nodejs",

      # Verify installations
      "node --version",
      "npm --version",

      # Install build essentials (needed for some npm packages)
      "sudo apt-get install -y build-essential",

      # Install CloudWatch Agent
      "wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb",
      "sudo dpkg -i -E ./amazon-cloudwatch-agent.deb",
      "rm amazon-cloudwatch-agent.deb",

      # Verify unzip installation
      "which unzip || sudo apt-get install -y unzip"
    ]
  }

  # Create csye6225 user and group
  provisioner "shell" {
    inline = [
      "sudo groupadd csye6225 || true",
      "sudo useradd -r -g csye6225 -s /usr/sbin/nologin csye6225",
      # Create application directory with proper ownership
      "sudo mkdir -p /opt/csye6225/app",
      "sudo chown -R csye6225:csye6225 /opt/csye6225",
      # Create npm directories with proper permissions
      "sudo mkdir -p /opt/csye6225/.npm-global",
      "sudo mkdir -p /opt/csye6225/.npm-cache",
      "sudo chown -R csye6225:csye6225 /opt/csye6225/.npm-global",
      "sudo chown -R csye6225:csye6225 /opt/csye6225/.npm-cache"
    ]
  }

  # Upload application files
  provisioner "file" {
    source      = "./build/artifact.zip"
    destination = "/tmp/app.zip"
  }

  # Configure and install application
  provisioner "shell" {
    inline = [
      # Double check unzip is installed
      "which unzip || sudo apt-get install -y unzip",
      # Unzip application to the proper directory
      "sudo unzip /tmp/app.zip -d /opt/csye6225/app",
      "sudo chown -R csye6225:csye6225 /opt/csye6225/app",

      # Configure npm for the csye6225 user
      "sudo -u csye6225 bash -c 'export HOME=/opt/csye6225 && npm config set prefix \"/opt/csye6225/.npm-global\"'",
      "sudo -u csye6225 bash -c 'export HOME=/opt/csye6225 && npm config set cache \"/opt/csye6225/.npm-cache\"'",

      # Install dependencies as csye6225 user with proper environment
      "cd /opt/csye6225/app && sudo -u csye6225 bash -c 'export HOME=/opt/csye6225 && npm install --legacy-peer-deps'"
    ]
  }

  # Set up systemd service
  provisioner "shell" {
    inline = [
      "sudo cp /opt/csye6225/app/systemd/my-node-app.service /etc/systemd/system/",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable my-node-app",
      "sudo systemctl start my-node-app"
    ]
  }

  # Configure CloudWatch Agent
  provisioner "shell" {
    inline = [
      # Create CloudWatch config directory
      "sudo mkdir -p /opt/aws/amazon-cloudwatch-agent/etc",
      # Copy config from app directory
      "sudo cp /opt/csye6225/app/cloudwatch-config.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
      "sudo chown root:root /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
      "sudo chmod 644 /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
      # Start CloudWatch agent
      "sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
      "sudo systemctl enable amazon-cloudwatch-agent",
      "sudo systemctl start amazon-cloudwatch-agent"
    ]
  }

  # Clean up
  provisioner "shell" {
    inline = [
      "rm -f /tmp/app.zip"
    ]
  }
}
